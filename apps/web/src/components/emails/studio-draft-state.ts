import type { EmailBlock } from "@allohq/email-builder";

export type StudioDraftContent = {
  blocks: EmailBlock[];
  subject: string;
  previewText: string;
};

export type StudioVersionContent = {
  sequence: number;
  document: unknown;
};

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`).join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

export function countStudioDraftChanges(saved: StudioDraftContent, draft: StudioDraftContent): number {
  let changes = Number(saved.subject !== draft.subject) + Number(saved.previewText !== draft.previewText);
  const savedById = new Map(saved.blocks.map((block) => [block.id, block]));
  const draftById = new Map(draft.blocks.map((block) => [block.id, block]));

  for (const block of saved.blocks) {
    const current = draftById.get(block.id);
    if (!current) { changes++; continue; }
    if (current.type !== block.type) { changes++; continue; }
    const before = block.props as Record<string, unknown>;
    const after = current.props as Record<string, unknown>;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (stableValue(before[key]) !== stableValue(after[key])) changes++;
    }
  }
  for (const block of draft.blocks) if (!savedById.has(block.id)) changes++;

  // Adding or removing a block shifts indexes but is not also a reorder.
  const sharedBefore = saved.blocks.filter((block) => draftById.has(block.id)).map((block) => block.id);
  const sharedAfter = draft.blocks.filter((block) => savedById.has(block.id)).map((block) => block.id);
  if (stableValue(sharedBefore) !== stableValue(sharedAfter)) changes++;
  return changes;
}

export function matchingStudioVersion(
  versions: StudioVersionContent[],
  draft: StudioDraftContent,
): number | null {
  const draftKey = stableValue(draft);
  for (const version of versions) {
    if (!version.document || typeof version.document !== "object") continue;
    const document = version.document as {
      blocks?: unknown;
      envelope?: { subject?: unknown; previewText?: unknown };
    };
    if (!Array.isArray(document.blocks)) continue;
    const versionKey = stableValue({
      blocks: document.blocks,
      subject: document.envelope?.subject ?? "",
      previewText: document.envelope?.previewText ?? "",
    });
    if (versionKey === draftKey) return version.sequence;
  }
  return null;
}
