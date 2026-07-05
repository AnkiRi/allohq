// Lightweight content-quality eval for generated copy. Two layers:
//   1. HARD CHECKS (deterministic, no LLM) — placeholders, empty/oversized fields, unrendered
//      template variables. These are the regression tripwire: if a cheap model creeps back onto
//      copy (see Phase 3 re-tiering) it tends to emit "Your Heading Here" / leave {{vars}}.
//   2. LLM-as-JUDGE (frontier model) — on-brand, coherent, follows the instruction, scored
//      against a rubric.
// Not a full eval platform — a harness + a few cases, run on real generated content.

import { complete } from "../ai";

export interface EvalContent {
  subject: string;
  body: string; // rendered/flattened text of the email body
}

export interface BrandContext {
  brandName: string;
  toneAttributes?: Record<string, string>;
  avoidWords?: string[];
}

export interface JudgeVerdict {
  onBrand: boolean;
  coherent: boolean;
  followsInstruction: boolean;
  score: number; // 0–100
  notes: string;
}

export interface ContentEvalResult {
  passed: boolean;
  hardFailures: string[];
  judge?: JudgeVerdict;
}

// Placeholder / not-finished tells a weak model leaves behind.
const PLACEHOLDER_PATTERNS: Array<[RegExp, string]> = [
  // "Your Heading Here" — specific placeholder nouns only (not legit copy like "your ritual is here")
  [/\byour\s+(heading|subheading|title|text|copy|content|headline|company|product|name|offer|tagline|logo|image)\s+here\b/i, "‘your … here’ placeholder"],
  [/lorem ipsum/i, "lorem ipsum"],
  [/\[(insert|your|add|company|name|product|first|last)[^\]]*\]/i, "[insert …] placeholder"],
  [/\bplaceholder\b/i, "literal ‘placeholder’"],
  [/\bsample (text|copy|heading)\b/i, "‘sample text’"],
  [/\bTODO\b/, "TODO left in copy"],
  [/X{4,}/, "XXXX filler"],
  // "<First Name>" style tokens — require a placeholder word inside (not real HTML tags)
  [/<\s*(first ?name|last ?name|full ?name|name|insert|your|company|product|email|text|heading|title)\b[^>]*>/i, "<…> placeholder token"],
];

/** Deterministic checks — no API call. Returns a list of failures (empty = clean). */
export function hardChecks(c: EvalContent, opts?: { minBodyChars?: number }): string[] {
  const fails: string[] = [];
  const subject = (c.subject ?? "").trim();
  const body = (c.body ?? "").trim();
  if (!subject) fails.push("empty subject");
  if (!body) fails.push("empty body");
  if (subject.length > 140) fails.push(`subject too long (${subject.length} > 140)`);
  if (body && body.length < (opts?.minBodyChars ?? 40)) fails.push(`body too short (${body.length} chars)`);
  const text = `${subject}\n${body}`;
  for (const [re, label] of PLACEHOLDER_PATTERNS) if (re.test(text)) fails.push(label);
  if (/\{\{.*?\}\}|\$\{.*?\}/.test(text)) fails.push("unrendered template variable");
  return fails;
}

/** LLM-as-judge on the FRONTIER tier (reasoning) against a brand-voice rubric. */
export async function judgeContent(
  c: EvalContent,
  brand: BrandContext,
  instruction: string,
): Promise<JudgeVerdict> {
  const prompt = `You are a strict brand-copy reviewer. Judge this marketing email against the brand + the instruction it was generated for. Be exacting — flag off-brand tone, incoherence, or ignoring the instruction.

BRAND: ${brand.brandName}
TONE: ${JSON.stringify(brand.toneAttributes ?? {})}
${brand.avoidWords?.length ? `MUST AVOID words/style: ${brand.avoidWords.join(", ")}` : ""}

INSTRUCTION THE COPY MUST FOLLOW: ${instruction}

EMAIL SUBJECT: ${c.subject}
EMAIL BODY:
${c.body}

Respond ONLY with JSON:
{"onBrand": bool, "coherent": bool, "followsInstruction": bool, "score": 0-100, "notes": "one sentence"}`;

  const result = await complete({ task: "reasoning", prompt, jsonMode: true, temperature: 0 });
  const v = JSON.parse(result.content) as JudgeVerdict;
  return {
    onBrand: !!v.onBrand,
    coherent: !!v.coherent,
    followsInstruction: !!v.followsInstruction,
    score: Number(v.score) || 0,
    notes: String(v.notes ?? ""),
  };
}

/** Full eval: hard checks first (cheap); judge only if hard checks pass and useJudge is set. */
export async function evalContent(
  c: EvalContent,
  opts: { brand: BrandContext; instruction: string; useJudge?: boolean; minScore?: number },
): Promise<ContentEvalResult> {
  const hardFailures = hardChecks(c);
  let judge: JudgeVerdict | undefined;
  if (opts.useJudge && hardFailures.length === 0) {
    judge = await judgeContent(c, opts.brand, opts.instruction);
  }
  // Pass = no deterministic failures AND (if judged) it follows the instruction and clears the
  // quality bar. Graded on score (standard eval gate) rather than requiring every rubric
  // boolean, so one harsh axis on otherwise-good copy doesn't fail it; but off-brand/instruction
  // misses (which tank the score and the follows flag) still fail.
  const minScore = opts.minScore ?? 70;
  const passed =
    hardFailures.length === 0 &&
    (!judge || (judge.followsInstruction && judge.score >= minScore));
  return { passed, hardFailures, judge };
}

/** Flatten generated email blocks into judge-able text (collects string values recursively). */
export function blocksToText(blocks: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(blocks);
  return out.join("\n");
}
