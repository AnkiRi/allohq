/**
 * What a single Ask-Joon request is allowed to touch.
 *
 * The model is told its scope in the prompt, but a prompt is a request, not a
 * guarantee — a model that ignores it, or a malformed response, would
 * otherwise rewrite blocks the merchant never selected. So scope is enforced
 * twice, structurally, and never by trusting the response:
 *
 *   1. `containToScope` drops out-of-scope changes BEFORE anything is applied.
 *   2. `scopeViolation` re-checks the result and refuses it if anything
 *      outside the scope moved anyway.
 *
 * Whole-email edits exist, but only when the merchant explicitly asks for
 * them: `{ kind: "document" }` is never inferred from a selection.
 */

export type EmailEditScope =
  | { kind: "block"; blockId: string }
  | { kind: "envelope" }
  | { kind: "document" };

/** The shape the model is asked to return: changes only, never a whole document. */
export type ModelChangeSet = {
  blocks?: Record<string, Record<string, unknown>>;
  add?: unknown[];
  remove?: string[];
  order?: string[];
  subject?: string;
  previewText?: string;
};

type Block = { id: string; type: string; props: Record<string, unknown> };

/** Human-readable scope, for the UI label and the proposal record. */
export function describeScope(scope: EmailEditScope): string {
  switch (scope.kind) {
    case "block":
      return "this block";
    case "envelope":
      return "the subject and inbox preview";
    case "document":
      return "the whole email";
  }
}

/**
 * Remove everything the scope does not permit. Structural, not advisory:
 * in block scope the add/remove/reorder/subject keys cannot survive at all.
 */
export function containToScope(scope: EmailEditScope, changes: ModelChangeSet): ModelChangeSet {
  if (scope.kind === "document") return changes;

  if (scope.kind === "envelope") {
    const contained: ModelChangeSet = {};
    if (typeof changes.subject === "string") contained.subject = changes.subject;
    if (typeof changes.previewText === "string") contained.previewText = changes.previewText;
    return contained;
  }

  const forBlock = changes.blocks?.[scope.blockId];
  return forBlock && typeof forBlock === "object" ? { blocks: { [scope.blockId]: forBlock } } : {};
}

/**
 * Post-condition. Returns a reason when the result moved something the scope
 * forbade, so the caller can refuse the proposal rather than show it.
 */
export function scopeViolation(
  scope: EmailEditScope,
  original: Block[],
  next: Block[],
  envelope: { subjectChanged: boolean; previewTextChanged: boolean },
): string | null {
  if (scope.kind === "document") return null;

  if (scope.kind === "envelope") {
    return sameBlocks(original, next)
      ? null
      : "a subject-line request may not change the email body";
  }

  if (envelope.subjectChanged || envelope.previewTextChanged) {
    return "a single-block request may not change the subject or inbox preview";
  }
  if (original.length !== next.length) {
    return "a single-block request may not add or remove blocks";
  }
  for (let index = 0; index < original.length; index += 1) {
    const before = original[index]!;
    const after = next[index]!;
    if (before.id !== after.id) {
      return "a single-block request may not reorder blocks";
    }
    if (before.id === scope.blockId) continue;
    if (!deepEqual(before, after)) {
      return `a request scoped to one block changed "${before.id}" as well`;
    }
  }
  return null;
}

function sameBlocks(a: Block[], b: Block[]): boolean {
  return a.length === b.length && a.every((block, index) => deepEqual(block, b[index]));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }
  if (typeof a !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key]));
}
