import { z } from "zod";
import { emailBlocksSchema, emailDocumentSchema, type EmailDocument } from "./schemas";
import type { EmailBlock } from "./types";

/**
 * Stored email documents carry `null` where the schema declares an optional
 * prop, and Zod treats `null` and `undefined` as different things.
 *
 * The live source is product enrichment. `Product.description` and
 * `Product.imageUrl` are nullable columns, so copying them onto a product
 * block writes `description: null` instead of omitting the key. One such
 * block fails the WHOLE document, and because `emailBlockSchema` wraps its
 * discriminated union in an outer `z.union`, the failure surfaces as
 * `invalid_union` at `blocks[3]` — naming neither `props` nor `description`.
 * That is why a product with no description took the preview down and blocked
 * saving.
 *
 * This converts `null` to "absent" at exactly the keys where the schema
 * already says absent is legal — `.optional()` or `.default()`. It is not a
 * loosening: `null` in a required prop still fails, unknown passthrough keys
 * are left alone, and the parse that follows is the unchanged schema.
 */

const MAX_DEPTH = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the schema already accepts the key being absent. */
function absenceIsLegal(schema: z.ZodTypeAny): boolean {
  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}

function normalize(schema: z.ZodTypeAny, value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return value;
  const def = (schema as { _def?: Record<string, any> })._def;
  switch (def?.["typeName"]) {
    case "ZodLazy":
      return normalize(def["getter"](), value, depth + 1);
    case "ZodDefault":
      return normalize(def["innerType"], value, depth + 1);
    case "ZodOptional":
    case "ZodNullable":
      return normalize(def["innerType"], value, depth + 1);
    case "ZodEffects":
      return normalize(def["schema"], value, depth + 1);
    case "ZodArray":
      return Array.isArray(value)
        ? value.map((item) => normalize(def["type"], item, depth + 1))
        : value;
    case "ZodDiscriminatedUnion": {
      if (!isPlainObject(value)) return value;
      const option = (schema as unknown as { optionsMap: Map<unknown, z.ZodTypeAny> })
        .optionsMap.get(value[def["discriminator"] as string]);
      return option ? normalize(option, value, depth + 1) : value;
    }
    case "ZodUnion": {
      for (const option of def["options"] as z.ZodTypeAny[]) {
        const candidate = normalize(option, value, depth + 1);
        if (option.safeParse(candidate).success) return candidate;
      }
      return value;
    }
    case "ZodObject": {
      if (!isPlainObject(value)) return value;
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      const next: Record<string, unknown> = { ...value };
      for (const [key, child] of Object.entries(shape)) {
        if (!(key in next)) continue;
        if (next[key] === null && absenceIsLegal(child)) {
          delete next[key];
          continue;
        }
        next[key] = normalize(child, next[key], depth + 1);
      }
      return next;
    }
    default:
      return value;
  }
}

/** Drop `null` from optional/defaulted keys of a stored block list. */
export function normalizeLegacyEmailBlocks(blocks: unknown): unknown {
  return normalize(emailBlocksSchema, blocks, 0);
}

/** Drop `null` from optional/defaulted keys of a stored email document. */
export function normalizeLegacyEmailDocument(document: unknown): unknown {
  return normalize(emailDocumentSchema, document, 0);
}

/** Normalize then parse. Use wherever STORED email data re-enters the app. */
export function parseEmailBlocks(blocks: unknown): EmailBlock[] {
  return emailBlocksSchema.parse(normalizeLegacyEmailBlocks(blocks)) as EmailBlock[];
}

/** Normalize then parse. Use wherever a STORED document re-enters the app. */
export function parseEmailDocument(document: unknown): EmailDocument {
  return emailDocumentSchema.parse(normalizeLegacyEmailDocument(document));
}

export function safeParseEmailDocument(document: unknown) {
  return emailDocumentSchema.safeParse(normalizeLegacyEmailDocument(document));
}
