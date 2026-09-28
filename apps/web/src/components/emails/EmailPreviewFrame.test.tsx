import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailPreviewFrame } from "./EmailPreviewFrame";

const html = '<html><head></head><body><div data-email-block-id="hero-1">Hello</div></body></html>';

test("the draft canvas keeps preview-only controls out of the editing path", () => {
  const markup = renderToStaticMarkup(createElement(EmailPreviewFrame, { html, mode: "editor", onSelectBlock: () => {} }));
  assert.match(markup, /Desktop/);
  assert.match(markup, /Mobile/);
  assert.doesNotMatch(markup, /Fit email/);
  assert.doesNotMatch(markup, /Dark/);
});

test("canvas blocks can be selected with Enter or Space", () => {
  const markup = renderToStaticMarkup(createElement(EmailPreviewFrame, { html, mode: "editor", onSelectBlock: () => {} }));
  assert.match(markup, /setAttribute\(&#x27;tabindex&#x27;,&#x27;0&#x27;\)/);
  assert.match(markup, /event\.key!==&#x27;Enter&#x27;/);
  assert.match(markup, /joon-email-block-select/);
});

test("preview height uses a natural content wrapper, not the iframe viewport", () => {
  const markup = renderToStaticMarkup(createElement(EmailPreviewFrame, { html }));
  assert.match(markup, /joon-email-content/);
  assert.match(markup, /content\.getBoundingClientRect/);
  assert.doesNotMatch(markup, /b\.scrollHeight/);
});
