import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BlockList } from "./BlockList";
import type { EmailBlock } from "@allohq/email-builder";

/**
 * Reordering an email was mouse-only: the controls lived behind `group-hover`
 * and the rows were unfocusable divs. These assert the keyboard path exists in
 * the markup rather than trusting that it does.
 */
const blocks = [
  { id: "b1", type: "hero", props: { heading: "Ride further" } },
  { id: "b2", type: "text", props: { html: "<p>New season.</p>" } },
  { id: "b3", type: "product", props: { productId: "p1" } },
] as unknown as EmailBlock[];

const title = (block: EmailBlock) =>
  block.type === "hero" ? "Ride further" : block.type === "text" ? "New season." : "Product";

const render = (selectedId: string | null = "b2", list = blocks) =>
  renderToStaticMarkup(
    createElement(BlockList, {
      blocks: list,
      selectedId,
      onSelect: () => {},
      onMove: () => {},
      onRemove: () => {},
      blockTitle: title,
    } as never),
  );

test("the list is a labelled listbox of options", () => {
  const markup = render();
  assert.match(markup, /role="listbox"/);
  assert.match(markup, /aria-label="Blocks in this email"/);
  assert.equal((markup.match(/role="option"/g) ?? []).length, 3);
});

test("every row is reachable by keyboard", () => {
  const markup = render();
  assert.equal((markup.match(/tabindex="0"/gi) ?? []).length, 3, "each row takes focus");
});

test("selection is exposed to assistive tech, not shown by colour alone", () => {
  const markup = render("b2");
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(markup, /— selected/, "and stated in text for screen readers");
});

test("move and delete controls exist in the markup, not only on hover", () => {
  const markup = render();
  assert.match(markup, /aria-label="Move Ride further down"/);
  assert.match(markup, /aria-label="Move New season\. up"/);
  assert.match(markup, /aria-label="Delete Product"/);
});

test("the controls are revealed by focus as well as hover", () => {
  // `group-hover` alone is what made these mouse-only.
  assert.match(render(), /group-focus-within:opacity-100/);
});

test("controls name the block they act on, not just the direction", () => {
  const markup = render();
  assert.doesNotMatch(markup, /aria-label="Move up"/, "an unlabelled 'Move up' is ambiguous in a list");
});

test("the ends of the list cannot be moved past", () => {
  const markup = render();
  const disabled = markup.match(/aria-label="Move [^"]*" title="Move [^"]*" disabled=""/g) ?? [];
  assert.equal(disabled.length, 2, "first cannot move up, last cannot move down");
});

test("the keyboard shortcut is stated, not hidden", () => {
  assert.match(render(), /Alt and an arrow key moves the block itself/);
});

test("an empty email says so plainly and blames nobody", () => {
  const markup = render(null, []);
  assert.match(markup, /This email is empty/);
  assert.match(markup, /Joon adds nothing on its own/);
});

test("focus rings are visible, not suppressed", () => {
  assert.match(render(), /focus-visible:ring-2/);
});
