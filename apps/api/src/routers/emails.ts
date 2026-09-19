import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import {
  complete,
  generateImage,
  loadBrandKit,
  renderBrandedEmail,
} from "@allohq/customer-intelligence";
import { buildBrandKit, type BrandKit } from "@allohq/emails";
import { TRPCError } from "@trpc/server";
import { emailBlocksSchema, emailBlockSchema, emailDocumentSchema } from "@allohq/email-builder";
import { ensureEmailVersion } from "../lib/email-versions";
import {
  createEmailAssetUpload,
  inspectUploadedEmailAsset,
  persistProductSafeComposite,
  persistRemoteEmailImage,
} from "../lib/email-asset-storage";

/**
 * Emails router — powers the "generate-first, edit-freely" /emails experience.
 *
 *  - promptEdit: the wedge. A natural-language instruction ("make the hero
 *    warmer", "drop the discount", "swap the product") regenerates the relevant
 *    block(s) of the EmailBlock[] via the LLM. Resilient: if the model is
 *    unavailable or returns garbage, the original blocks are returned unchanged.
 *  - renderPreview: round-trips EmailBlock[] → bulletproof React Email HTML so
 *    every edit (prompt OR direct manipulation) re-renders cross-client-safe.
 *
 * Both accept an optional inline brandKit so the editor can render the Vana
 * demo brand without requiring a connected store.
 */

const brandKitSchema = z.any().optional();

/** Resolve a BrandKit: prefer an inline kit, else derive from the store, else default. */
async function resolveBrandKit(
  ctx: { prisma: any; workspaceId: string },
  inlineKit: unknown,
  storeId?: string
): Promise<{ brandKit: BrandKit; storeId: string }> {
  if (inlineKit && typeof inlineKit === "object") {
    return { brandKit: inlineKit as BrandKit, storeId: storeId ?? "" };
  }
  const stores = storeId
    ? await ctx.prisma.store.findMany({
        where: { id: storeId, workspaceId: ctx.workspaceId },
        take: 1,
      })
    : await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId, isActive: true },
        take: 2,
      });
  if (!storeId && stores.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose a store before editing this email. Joon will not guess across stores.",
    });
  }
  const store = stores[0];
  const resolvedStoreId = store?.id ?? "";
  return {
    brandKit: resolvedStoreId ? await loadBrandKit(resolvedStoreId) : buildBrandKit(null, null),
    storeId: resolvedStoreId,
  };
}

// LLMs (esp. Claude) often wrap JSON in ```fences``` or add a trailing note, so
// JSON.parse(result.content) throws and the prompt-edit silently no-ops. Extract
// the JSON payload before parsing. promptEdit's response is an OBJECT (which may
// CONTAIN arrays like `add: [...]`), so take the outermost object — first "{" to
// last "}". Prose brackets like "[Brand Name]" are "[", so starting at "{" skips
// them; falls back to an array only if there's no object at all.
function extractJsonPayload(s: string): string {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) t = fence[1].trim();
  const o = t.indexOf("{");
  const lo = t.lastIndexOf("}");
  if (o !== -1 && lo > o) return t.slice(o, lo + 1);
  const a = t.indexOf("[");
  const la = t.lastIndexOf("]");
  if (a !== -1 && la > a) return t.slice(a, la + 1);
  return t;
}

export const emailsRouter = router({
  proposalHistory: workspaceProcedure
    .input(z.object({ templateId: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.emailTemplate.findFirst({
        where: { id: input.templateId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });
      const rows = await ctx.prisma.emailProposal.findMany({
        where: { templateId: input.templateId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          instruction: true,
          scope: true,
          status: true,
          operations: true,
          createdAt: true,
          resolvedAt: true,
        },
      });
      return rows.reverse();
    }),

  createAssetUpload: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      fileName: z.string().min(1).max(240),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      size: z.number().int().positive().max(12 * 1024 * 1024),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId, isActive: true },
        select: { id: true },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });
      return createEmailAssetUpload({ workspaceId: ctx.workspaceId, ...input });
    }),

  completeAssetUpload: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      key: z.string().min(1).max(1000),
      fileName: z.string().min(1).max(240),
      type: z.enum(["logo", "logo_dark", "hero", "lifestyle", "icon", "reference_image", "other"]),
      altText: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId, isActive: true },
        select: { id: true },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });
      const uploaded = await inspectUploadedEmailAsset({
        workspaceId: ctx.workspaceId,
        storeId: input.storeId,
        key: input.key,
      });
      return ctx.prisma.brandAsset.create({
        data: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          type: input.type,
          url: uploaded.url,
          fileName: input.fileName,
          mimeType: uploaded.mimeType,
          storageKey: input.key,
          checksum: uploaded.checksum,
          source: "upload",
          altText: input.altText,
          status: "ready",
        },
      });
    }),

  /**
   * Render an EmailBlock[] content model to bulletproof, brand-styled HTML.
   * Used by the live preview after every edit.
   */
  renderPreview: workspaceProcedure
    .input(
      z.object({
        blocks: emailBlocksSchema,
        subject: z.string().optional(),
        previewText: z.string().optional(),
        variables: z.record(z.string()).optional(),
        brandKit: brandKitSchema,
        storeId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { brandKit, storeId } = await resolveBrandKit(ctx, input.brandKit, input.storeId);
      const html = await renderBrandedEmail({
        storeId,
        brandKit,
        blocks: input.blocks as any,
        subject: input.subject,
        previewText: input.previewText,
        variables: input.variables ?? {},
        previewMode: true,
      });
      return { html };
    }),

  /**
   * Prompt-edit: regenerate the EmailBlock[] from a natural-language instruction.
   *
   * Resilient by design — if the LLM is unavailable, returns the original blocks
   * unchanged with `applied: false` so the editor never breaks.
   */
  promptEdit: workspaceProcedure
    .input(
      z.object({
        instruction: z.string().min(1).max(2000),
        blocks: emailBlocksSchema,
        subject: z.string().optional(),
        previewText: z.string().optional(),
        brandVoice: z.string().optional(),
        storeId: z.string().optional(),
        templateId: z.string().optional(),
        sourceAssetIds: z.array(z.string()).max(5).optional(),
        selectedBlockId: z.string().optional(),
        // Lane for a chip: "subject" → only the subject; "copy"/"tone" → only
        // existing-block copy edits; "visual" → only structure (add/remove/reorder
        // + visual blocks). Omitted (free-text "tell joon") = no restriction.
        scope: z.enum(["subject", "copy", "visual", "tone"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const original = input.blocks as any[];
      const workspaceAiSettings = await ctx.prisma.workspace.findUnique({
        where: { id: ctx.workspaceId },
        select: { modelHarness: true },
      });
      const persistProposal = async (
        candidateBlocks: unknown,
        candidateSubject: string,
        candidatePreviewText: string,
        operations: unknown,
      ) => {
        if (!input.templateId) return null;
        const template = await ctx.prisma.emailTemplate.findFirst({
          where: { id: input.templateId, workspaceId: ctx.workspaceId },
          select: { id: true },
        });
        if (!template) {
          throw new TRPCError({ code: "NOT_FOUND", message: "This email no longer exists." });
        }
        const baseVersion = await ctx.prisma.emailVersion.findFirst({
          where: { templateId: input.templateId },
          orderBy: { sequence: "desc" },
          select: { id: true },
        });
        const candidate = emailDocumentSchema.parse({
          schemaVersion: 1,
          envelope: {
            subject: candidateSubject,
            previewText: candidatePreviewText,
            locale: "en",
          },
          blocks: candidateBlocks,
          metadata: {},
        });
        return ctx.prisma.emailProposal.create({
          data: {
            workspaceId: ctx.workspaceId,
            templateId: input.templateId,
            baseVersionId: baseVersion?.id,
            instruction: input.instruction,
            scope: input.scope,
            operations: operations as any,
            candidate: candidate as any,
            createdBy: (ctx as any).userId,
          },
          select: { id: true },
        });
      };

      const conversationHistory = input.templateId
        ? await ctx.prisma.emailProposal.findMany({
            where: { templateId: input.templateId, workspaceId: ctx.workspaceId },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: { instruction: true, status: true },
          })
        : [];

      // CONTRACT: the model returns ONLY the CHANGES (subject + per-block changed
      // props), keyed by block id — NOT the whole array. Small, targeted JSON is
      // far less likely to be malformed (the whole-array round-trip produced
      // unescaped newlines/quotes inside html and broke JSON.parse). We apply the
      // changes onto the existing blocks server-side.
      const SCOPE_RULE: Record<string, string> = {
        subject:
          'SCOPE: change ONLY the subject. Return just { "subject": "..." } — do NOT touch any blocks.',
        copy: "SCOPE: edit ONLY the copy of EXISTING blocks. Do NOT change the subject, and do NOT add, remove, or reorder blocks.",
        tone: "SCOPE: adjust ONLY the tone of EXISTING blocks' copy. Do NOT change the subject, and do NOT add, remove, or reorder blocks.",
        visual:
          "SCOPE: change ONLY the visual structure — add/remove/reorder blocks and edit visual blocks (image/hero/product/product_grid). Do NOT change the subject and do NOT rewrite body copy.",
      };
      const system = [
        "You are joon, an expert email copywriter + designer for an Indian e-commerce brand.",
        "You receive the email as JSON blocks {id,type,props} and an instruction.",
        "Apply the instruction and return ONLY THE CHANGES as a compact JSON object —",
        "never the whole array. You can EDIT, ADD, REMOVE, and REORDER blocks.",
        input.scope ? "\n" + SCOPE_RULE[input.scope] + "\n" : "",
        "",
        "Block types: hero, text, image, button, product, product_grid, icon_row,",
        "testimonial, divider, spacer, social.",
        "",
        "RETURN EXACTLY this shape (include only the keys you actually need):",
        "{",
        '  "subject": "<new subject — omit if unchanged>",',
        '  "previewText": "<new inbox preview — omit if unchanged>",',
        '  "blocks": { "<existingId>": { "<prop>": <newValue> } },        // EDIT existing',
        '  "add": [ { "type": "image", "props": { }, "afterId": "<existingId>" } ], // ADD new',
        '  "remove": ["<existingId>"],                                     // DELETE',
        '  "order": ["<id>", "<id>"]                                       // REORDER (full id list)',
        "}",
        "",
        "RULES:",
        "- EDIT: only changed blocks (by existing id), only changed props. text → props.html (\\n\\n between paragraphs).",
        "- MORE VISUAL / add imagery: ADD a hero, an image, or — best for a store — a product_grid",
        '  with props { "source": "trending", "columns": 3, "dynamicProductCount": 3, "showPrice": true }.',
        "  product_grid renders REAL store products at send time, so you never need an image URL. Place it with afterId.",
        '- CHANGE LAYOUT: use "order" to resequence, and add/remove blocks as needed.',
        "- Keep existing ids/types stable. Keep merge tags like {{first_name}} intact. ₹ prices plain numbers.",
        "- If the instruction concerns the inbox line, edit previewText. Keep it complementary to the subject, not repetitive.",
        "- Warm, unhurried brand voice. Never hype, ALL-CAPS, or fake urgency.",
        '- The response MUST be valid JSON: escape EVERY newline as \\n and EVERY double-quote as \\". No literal line breaks inside strings.',
        "- Return ONLY the JSON object — no prose, no markdown fences.",
        input.brandVoice ? `\nBRAND VOICE NOTES:\n${input.brandVoice}` : "",
      ].join("\n");

      const prompt = [
        `INSTRUCTION: ${input.instruction}`,
        input.subject ? `\nCURRENT SUBJECT: ${input.subject}` : "",
        input.selectedBlockId
          ? `\nSELECTED BLOCK: ${input.selectedBlockId}. Unless the instruction explicitly says whole email, target this block.`
          : "",
        conversationHistory.length
          ? `\nRECENT STUDIO CONTEXT (oldest to newest):\n${conversationHistory
              .reverse()
              .map((item) => `- ${item.instruction} [${item.status}]`)
              .join("\n")}`
          : "",
        "",
        "CURRENT BLOCKS:",
        JSON.stringify(
          original.map((b) => ({ id: b.id, type: b.type, props: b.props })),
          null,
          2
        ),
        "",
        "Return ONLY the changes object.",
      ].join("\n");

      const fail = (error: string) => ({
        applied: false,
        blocks: original,
        subject: input.subject,
        error,
      });

      const requestsGeneratedImage =
        (/\b(?:generate|create|make)\b[\s\S]{0,120}\b(?:image|photo|visual|scene)\b/i.test(
          input.instruction
        ) ||
          /\b(?:put|place|swap|replace)\b[\s\S]{0,160}\b(?:model|hand|scene|background|product|image|photo)\b/i.test(
            input.instruction
          )) &&
        (!input.scope || input.scope === "visual");
      if (requestsGeneratedImage) {
        try {
          const { storeId } = await resolveBrandKit(ctx, undefined, input.storeId);
          const sourceAssets = input.sourceAssetIds?.length
            ? await ctx.prisma.brandAsset.findMany({
                where: {
                  id: { in: input.sourceAssetIds },
                  workspaceId: ctx.workspaceId,
                  ...(storeId ? { storeId } : {}),
                },
                select: { id: true, url: true, type: true },
              })
            : [];
          const visual = storeId
            ? await ctx.prisma.brandVisualProfile.findUnique({ where: { storeId } })
            : null;
          const generated = await generateImage({
            purpose: "hero_banner",
            prompt: [
              input.instruction,
              sourceAssets.length
                ? "Generate only the setting and background. Do not draw products, packaging, labels, logos or text; Joon will composite the authoritative product pixels afterward."
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
            brandStyle: visual
              ? {
                  aesthetic:
                    visual.aestheticClassification ?? visual.visualTone ?? "brand-consistent",
                  suggestedColors: [
                    ...((visual.primaryColors as string[]) ?? []),
                    ...((visual.accentColors as string[]) ?? []),
                  ].slice(0, 6),
                }
              : undefined,
            fallbackToStock: false,
          });
          if (!storeId) throw new Error("Choose a store before generating an email image.");
          const persisted = sourceAssets[0]
            ? await persistProductSafeComposite({
                workspaceId: ctx.workspaceId,
                storeId,
                backgroundUrl: generated.url,
                productUrl: sourceAssets[0].url,
                fileName: `${input.templateId ?? "email"}-${Date.now()}.png`,
              })
            : await persistRemoteEmailImage({
                workspaceId: ctx.workspaceId,
                storeId,
                remoteUrl: generated.url,
                fileName: `${input.templateId ?? "email"}-${Date.now()}.png`,
              });
          await ctx.prisma.generatedImage.create({
            data: {
              workspaceId: ctx.workspaceId,
              provider: generated.provider,
              prompt: generated.prompt,
              url: persisted.url,
              purpose: "hero_banner",
              cost: generated.cost,
              width: persisted.width,
              height: persisted.height,
              templateId: input.templateId,
              sourceAssetIds: sourceAssets.map((asset: any) => asset.id),
            },
          });
          const durableAsset = await ctx.prisma.brandAsset.create({
            data: {
              workspaceId: ctx.workspaceId,
              storeId,
              type: "hero",
              url: persisted.url,
              fileName: `${input.templateId ?? "email"}-generated.png`,
              mimeType: persisted.mimeType,
              width: persisted.width,
              height: persisted.height,
              storageKey: persisted.key,
              checksum: persisted.checksum,
              source: "generated",
              sourcePrompt: generated.prompt,
              sourceAssetIds: sourceAssets.map((asset: any) => asset.id),
              altText: input.instruction,
              status: "ready",
            },
          });
          const imageBlock = emailBlockSchema.parse({
            id: `b-${Date.now()}-generated-image`,
            type: "image",
            props: {
                src: persisted.url,
              alt: input.instruction,
              align: "center",
              fullWidth: true,
            },
          });
          const selectedIndex = input.selectedBlockId
            ? original.findIndex((block) => block.id === input.selectedBlockId)
            : -1;
          const selectedBlock = selectedIndex >= 0 ? original[selectedIndex] : null;
          let nextBlocks = [...original];
          if (selectedBlock?.type === "image") {
            nextBlocks[selectedIndex] = {
              ...selectedBlock,
              props: { ...selectedBlock.props, src: persisted.url, alt: input.instruction },
            };
          } else if (selectedBlock?.type === "hero") {
            nextBlocks[selectedIndex] = {
              ...selectedBlock,
              props: { ...selectedBlock.props, bgImageSrc: persisted.url },
            };
          } else if (selectedBlock?.type === "product") {
            nextBlocks[selectedIndex] = {
              ...selectedBlock,
              props: { ...selectedBlock.props, imageUrl: persisted.url },
            };
          } else {
            nextBlocks.push(imageBlock);
          }
          const proposal = await persistProposal(
            nextBlocks,
            input.subject ?? "",
            input.previewText ?? "",
            {
              type: selectedBlock?.type === "image" || selectedBlock?.type === "hero" || selectedBlock?.type === "product"
                ? "replaceAsset"
                : "insertBlock",
              blockId: selectedBlock?.id ?? null,
              generatedUrl: persisted.url,
            },
          );
          return {
            applied: true,
            blocks: emailBlocksSchema.parse(nextBlocks),
            subject: input.subject,
            previewText: input.previewText,
            proposalId: proposal?.id,
            generatedAsset: { id: durableAsset.id, url: persisted.url, provider: generated.provider },
          };
        } catch (error) {
          return fail(
            error instanceof Error ? error.message : "Joon could not generate that image."
          );
        }
      }

      try {
        const result = await complete({
          workload: "creative",
          harness: workspaceAiSettings?.modelHarness,
          prompt,
          system,
          jsonMode: true,
          temperature: 0.6,
          maxTokens: 2048,
        });

        const parsed = JSON.parse(extractJsonPayload(result.content));
        const changes: Record<string, Record<string, unknown>> = parsed &&
        typeof parsed === "object" &&
        parsed.blocks &&
        typeof parsed.blocks === "object"
          ? parsed.blocks
          : {};
        const removeIds = new Set(
          Array.isArray(parsed?.remove)
            ? parsed.remove.filter((x: unknown) => typeof x === "string")
            : []
        );
        const addList: any[] = Array.isArray(parsed?.add) ? parsed.add : [];
        const order: string[] | null = Array.isArray(parsed?.order)
          ? parsed.order.filter((x: unknown) => typeof x === "string")
          : null;
        const newSubject =
          typeof parsed?.subject === "string" && parsed.subject.trim()
            ? parsed.subject.trim()
            : undefined;
        const newPreviewText =
          typeof parsed?.previewText === "string"
            ? parsed.previewText.trim()
            : undefined;

        // Enforce the chip's lane — drop any out-of-scope changes the model returned,
        // so Subject chips never touch the body, Copy/Tone never touch the subject or
        // structure, and Visual never rewrites the subject. (Belt-and-suspenders over
        // the SCOPE_RULE in the prompt.)
        const sc = input.scope;
        const editsAllowed = !sc || sc === "copy" || sc === "tone" || sc === "visual";
        const structureAllowed = !sc || sc === "visual";
        const subjectAllowed = !sc || sc === "subject";
        const previewAllowed = !sc || sc === "subject" || sc === "copy" || sc === "tone";
        const effChanges = editsAllowed ? changes : {};
        const effRemove = structureAllowed ? removeIds : new Set<string>();
        const effAdd = structureAllowed ? addList : [];
        const effOrder = structureAllowed ? order : null;
        const effSubject = subjectAllowed ? newSubject : undefined;
        const effPreviewText = previewAllowed ? newPreviewText : undefined;

        // 1. edit existing + drop removed
        let next = original
          .filter((b) => !effRemove.has(b.id))
          .map((b) =>
            effChanges[b.id] && typeof effChanges[b.id] === "object"
              ? { ...b, props: { ...b.props, ...effChanges[b.id] } }
              : b
          );

        // 2. add new blocks (server assigns ids; insert after afterId or append)
        let addCount = 0;
        for (const a of effAdd) {
          if (!a || typeof a !== "object" || typeof a.type !== "string") continue;
          const block = {
            id: `b-${Date.now()}-${addCount}`,
            type: a.type,
            props: a.props && typeof a.props === "object" ? a.props : {},
          };
          const idx = a.afterId ? next.findIndex((b) => b.id === a.afterId) : -1;
          if (idx >= 0) next.splice(idx + 1, 0, block);
          else next.push(block);
          addCount++;
        }

        // 3. reorder (known ids first in the given order, then any leftovers)
        if (effOrder && effOrder.length) {
          const byId = new Map(next.map((b) => [b.id, b]));
          const ordered = effOrder.map((id) => byId.get(id)).filter(Boolean) as any[];
          const rest = next.filter((b) => !effOrder!.includes(b.id));
          if (ordered.length) next = [...ordered, ...rest];
        }

        const changedCount = Object.keys(effChanges).filter((id) =>
          original.some((b) => b.id === id)
        ).length;
        const applied =
          changedCount > 0 || addCount > 0 || effRemove.size > 0 || !!effOrder || !!effSubject || effPreviewText !== undefined;

        if (!applied) {
          return fail("joon didn't change anything — try rephrasing.");
        }
        const validatedBlocks = emailBlocksSchema.safeParse(next);
        if (!validatedBlocks.success) {
          return fail(`Joon proposed an invalid email change: ${validatedBlocks.error.issues[0]?.message ?? "validation failed"}`);
        }
        const proposal = await persistProposal(
          validatedBlocks.data,
          effSubject ?? input.subject ?? "",
          effPreviewText ?? input.previewText ?? "",
          parsed,
        );
        return {
          applied: true,
          blocks: validatedBlocks.data,
          subject: effSubject ?? input.subject,
          previewText: effPreviewText ?? input.previewText,
          proposalId: proposal?.id,
          model: result.model,
        };
      } catch (err: any) {
        return fail(err?.message ?? "joon is unavailable right now. Your email is unchanged.");
      }
    }),

  resolveProposal: workspaceProcedure
    .input(
      z.object({
        proposalId: z.string(),
        decision: z.enum(["accepted", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await ctx.prisma.emailProposal.findFirst({
        where: {
          id: input.proposalId,
          workspaceId: ctx.workspaceId,
          status: "pending",
        },
      });
      if (!proposal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This proposal was already resolved or no longer exists.",
        });
      }
      if (input.decision === "rejected") {
        await ctx.prisma.emailProposal.update({
          where: { id: proposal.id },
          data: { status: "rejected", resolvedAt: new Date() },
        });
        return { status: "rejected" as const, version: null };
      }

      const candidate = emailDocumentSchema.parse(proposal.candidate);
      const result = await ctx.prisma.$transaction(async (tx) => {
        const latestVersion = await tx.emailVersion.findFirst({
          where: { templateId: proposal.templateId },
          orderBy: { sequence: "desc" },
          select: { id: true },
        });
        if ((proposal.baseVersionId ?? null) !== (latestVersion?.id ?? null)) {
          await tx.emailProposal.update({
            where: { id: proposal.id },
            data: { status: "superseded", resolvedAt: new Date() },
          });
          return { status: "superseded" as const, version: null };
        }
        const updated = await tx.emailTemplate.update({
          where: { id: proposal.templateId },
          data: {
            subject: candidate.envelope.subject,
            previewText: candidate.envelope.previewText,
            blocks: candidate.blocks as any,
            html: null,
          },
        });
        const campaign = await tx.campaign.findFirst({
          where: { templateId: proposal.templateId },
          select: { storeId: true },
          orderBy: { createdAt: "desc" },
        });
        const version = await ensureEmailVersion(tx, {
          workspaceId: ctx.workspaceId,
          templateId: proposal.templateId,
          storeId: campaign?.storeId,
          template: updated,
          source: "joon",
          note: proposal.instruction,
          createdBy: (ctx as any).userId,
        });
        await tx.emailProposal.update({
          where: { id: proposal.id },
          data: { status: "accepted", resolvedAt: new Date() },
        });
        return { status: "accepted" as const, version };
      });
      if (result.status === "superseded") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This proposal was based on an older email version. Ask Joon again to review the current version.",
        });
      }
      return result;
    }),
});
