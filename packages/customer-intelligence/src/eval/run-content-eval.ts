// Content-quality eval harness. Runs the eval over REAL generated Vana copy plus a couple of
// injected bad cases, and reports per-case pass/fail + a pass rate. This is also the
// regression tripwire for model re-tiering (Phase 3): if copy generation drifts back onto a
// cheap model, the on-brand / placeholder checks start failing here.
//
// Run:  pnpm --filter @allohq/customer-intelligence exec tsx src/eval/run-content-eval.ts
//       (add --no-generate to skip the live LLM generation and run fixtures only)

import "dotenv/config";
import { generateEmail } from "../content/generate-email";
import { evalContent, blocksToText, type BrandContext } from "./content-quality";

const VANA: BrandContext = {
  brandName: "Vana Naturals",
  toneAttributes: { voice: "warm, calm, grounded", style: "plant-based wellness, unhurried, human" },
  avoidWords: ["FIRE SALE", "UNMISSABLE", "BUY NOW", "hype", "all-caps shouting", "excessive emojis"],
};

const VANA_BRAND_PROFILE = {
  brandName: "Vana Naturals",
  brandDescription: "Indian plant-based wellness D2C — calm, natural, grounded.",
  toneAttributes: { voice: "warm", pace: "unhurried", register: "human" },
  vocabulary: { prefer: ["nourish", "ritual", "botanical"], avoid: ["FIRE SALE", "hype"] },
  visualStyle: { palette: ["sage", "clay"] },
  sampleCopy: ["Drafts before sunrise. Approvals over coffee."],
};

const PRODUCTS = [
  { id: "p1", title: "Ashwagandha Calm Tonic", description: "Adaptogenic evening ritual", price: 899, handle: "calm-tonic" },
  { id: "p2", title: "Brahmi Focus Blend", description: "Botanical daytime clarity", price: 749, handle: "focus-blend" },
];

interface Case { name: string; subject: string; body: string; instruction: string; expectPass: boolean }

async function buildLiveCases(): Promise<Case[]> {
  const cases: Case[] = [];
  const intents: Array<{ intent: any; instruction: string }> = [
    { intent: "win_back", instruction: "Win back a lapsed customer; acknowledge their absence warmly, offer a gentle reason to return." },
    { intent: "vip_reward", instruction: "Reward a loyal VIP; make them feel appreciated, exclusive, calm — not salesy." },
  ];
  for (const { intent, instruction } of intents) {
    const r = await generateEmail({
      brandProfile: VANA_BRAND_PROFILE as any,
      intent,
      creativeIntensity: "balanced" as any,
      products: PRODUCTS as any,
      storeUrl: "https://vana-demo.myshopify.com",
    } as any);
    cases.push({ name: `live:${intent}`, subject: r.subject, body: blocksToText(r.blocks), instruction, expectPass: true });
  }
  return cases;
}

const FIXTURES: Case[] = [
  {
    name: "fixture:placeholder(BAD)",
    subject: "Your Subject Here",
    body: "Hello [First Name], insert your amazing offer here. Lorem ipsum dolor sit amet. {{discount_code}}",
    instruction: "Win-back email for lapsed customers.",
    expectPass: false,
  },
  {
    name: "fixture:off-brand(BAD)",
    subject: "🔥🔥 UNMISSABLE FIRE SALE — BUY NOW!!!",
    body: "SMASH that buy button!! Don't miss out, stock is running OUT, act NOW or regret it forever!!! 🔥🔥🔥",
    instruction: "Calm, warm win-back for a plant-based wellness brand.",
    expectPass: false,
  },
  {
    name: "fixture:good(GOOD)",
    subject: "A quiet moment, back on your shelf",
    body: "It's been a while. Your evening ritual is here whenever you're ready — the Ashwagandha Calm Tonic you loved, gently waiting. No rush. Come back when it feels right.",
    instruction: "Calm, warm win-back for a plant-based wellness brand.",
    expectPass: true,
  },
];

(async () => {
  const noGenerate = process.argv.includes("--no-generate");
  let cases: Case[] = [...FIXTURES];
  if (!noGenerate) {
    try {
      cases = [...(await buildLiveCases()), ...FIXTURES];
    } catch (e) {
      console.log(`(live generation skipped: ${(e as Error).message}) — running fixtures only`);
    }
  }

  let correct = 0;
  console.log("\ncase                          hardFails  judge(onBrand/coherent/follows/score)  passed  expected");
  console.log("─".repeat(100));
  for (const c of cases) {
    const res = await evalContent(
      { subject: c.subject, body: c.body },
      { brand: VANA, instruction: c.instruction, useJudge: true },
    );
    const j = res.judge;
    const judgeStr = j ? `${j.onBrand ? "Y" : "n"}/${j.coherent ? "Y" : "n"}/${j.followsInstruction ? "Y" : "n"}/${j.score}` : "—(hard-fail)";
    const ok = res.passed === c.expectPass;
    if (ok) correct++;
    console.log(
      `${c.name.padEnd(30)}${String(res.hardFailures.length).padStart(4)}       ${judgeStr.padEnd(38)}${String(res.passed).padEnd(8)}${c.expectPass}  ${ok ? "✓" : "✗ MISCLASSIFIED"}`,
    );
    if (res.hardFailures.length) console.log(`    hardFailures: ${res.hardFailures.join("; ")}`);
  }
  console.log("─".repeat(100));
  console.log(`eval accuracy: ${correct}/${cases.length} cases classified as expected\n`);
})();
