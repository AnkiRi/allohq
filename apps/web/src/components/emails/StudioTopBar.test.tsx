import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { StudioTopBar } from "./StudioTopBar";

/**
 * A full-page surface with no visible exit is a trap, so the way out is
 * asserted rather than assumed.
 */
const render = (overrides: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(StudioTopBar, {
      name: "Winter drop",
      state: "draft",
      canUndo: true,
      canRedo: false,
      onUndo: () => {},
      onRedo: () => {},
      onPreview: () => {},
      onSave: () => {},
      saving: false,
      reviewHref: "/campaigns/c1",
      onAddBlock: () => {},
      onOpenTools: () => {},
      ...overrides,
    } as never),
  );

test("there is always a way back to the library", () => {
  assert.match(render(), /href="\/templates"/);
  assert.match(render(), /Email library/);
});

test("the email is named and its state stated", () => {
  assert.match(render(), /Winter drop/);
  assert.match(render({ state: "draft" }), /Unsaved draft/);
  assert.match(render({ state: "saved" }), /Saved/);
  assert.match(render({ state: "approved" }), /Approved/);
});

test("undo and redo reflect what is actually available", () => {
  const markup = render({ canUndo: false, canRedo: true });
  const undo = markup.slice(markup.indexOf('aria-label="Undo"'), markup.indexOf('aria-label="Undo"') + 220);
  const redo = markup.slice(markup.indexOf('aria-label="Redo"'), markup.indexOf('aria-label="Redo"') + 220);
  // `disabled:opacity-30` is in the class string, so match the ATTRIBUTE.
  assert.match(undo, /disabled=""/, "nothing to undo, so the control is disabled");
  assert.doesNotMatch(redo, /disabled=""/, "there is something to redo");
});

test("the review entry point appears only when a campaign exists", () => {
  assert.match(render(), /href="\/campaigns\/c1"/);
  assert.doesNotMatch(render({ reviewHref: null }), /\/campaigns\//);
});

test("saving says so rather than looking idle", () => {
  assert.match(render({ saving: true }), /Saving…/);
  assert.match(render({ saving: true }), /disabled=""/);
});

test("the drawer entry points exist for narrow screens", () => {
  // Without these a merchant on a phone can preview an email and nothing else.
  const markup = render();
  assert.match(markup, /aria-label="Add block"/);
  assert.match(markup, />Tools</);
});

test("every icon-only control is labelled", () => {
  const markup = render();
  for (const label of ["Undo", "Redo", "Preview", "Add block"]) {
    assert.match(markup, new RegExp(`aria-label="${label}"`), `${label} needs a label`);
  }
});
