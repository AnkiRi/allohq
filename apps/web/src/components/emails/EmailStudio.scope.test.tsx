import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ScopeChooser, type AskScope } from "./AskScope";

/**
 * The scope switch is how a merchant sees, before they press send, what a
 * request is allowed to touch. The server enforces the same boundary; this
 * asserts the UI states it honestly rather than implying it.
 */
const heading = "Ride further";

const render = (scope: AskScope, selectedTitle: string | null) =>
  renderToStaticMarkup(createElement(ScopeChooser, { scope, setScope: () => {}, selectedTitle }));

test("the chooser names all three scopes", () => {
  const markup = render("block", heading);
  assert.match(markup, /Ride further/);
  assert.match(markup, /Subject &amp; preview/);
  assert.match(markup, /Whole email/);
});

test("block scope promises containment in the merchant's words", () => {
  const markup = render("block", heading);
  assert.match(markup, /only change the selected block/);
  assert.match(markup, /subject stay as they are/);
});

test("whole-email scope says plainly that it can change anything", () => {
  assert.match(render("document", heading), /can change any part of this email/);
});

test("envelope scope promises the body is left alone", () => {
  assert.match(render("envelope", heading), /body stays as it is/);
});

test("block scope cannot be chosen with nothing selected", () => {
  const markup = render("document", null);
  assert.match(markup, /disabled=""/, "the block option is disabled with no selection");
  assert.match(markup, /Select a block in the email first/);
});

test("the chooser is a labelled radio group, not colour alone", () => {
  const markup = render("block", heading);
  assert.match(markup, /role="radiogroup"/);
  assert.match(markup, /aria-labelledby="ask-scope-label"/);
  assert.match(markup, /role="radio"/);
  assert.match(markup, /aria-checked="true"/, "the active scope is exposed to assistive tech");
});

test("exactly one scope reads as checked", () => {
  const markup = render("envelope", heading);
  assert.equal((markup.match(/aria-checked="true"/g) ?? []).length, 1);
});
