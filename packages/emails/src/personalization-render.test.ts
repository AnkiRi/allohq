import assert from "node:assert/strict";
import test from "node:test";
import { renderGeneratedEmail } from "./render";
import { buildBrandKit } from "./brand-kit";

/**
 * The renderer is the last place a merge tag can be caught. Everything before
 * it is advice; this is what actually reaches the inbox.
 */
const brandKit = buildBrandKit(null, null);

const render = (html: string, variables: Record<string, string> = {}) =>
  renderGeneratedEmail(
    {
      blocks: [{ id: "t", type: "text", props: { html } }] as never,
      subject: "Winter drop",
      previewText: "Inside",
    },
    brandKit,
    { variables },
  );

test("a token the sender cannot fill never reaches the rendered email", async () => {
  const output = await render("<p>Hi {{firstname}}, your {{city}} order is ready.</p>");
  assert.doesNotMatch(output, /\{\{firstname\}\}/);
  assert.doesNotMatch(output, /\{\{city\}\}/);
  assert.match(output, /order is ready/, "the rest of the sentence survives");
});

test("a real value is rendered", async () => {
  const output = await render("<p>Hi {{first_name}},</p>", { first_name: "Priya" });
  assert.match(output, /Hi Priya,/);
});

test("a customer with no first name gets the fallback, not an empty greeting", async () => {
  const output = await render("<p>Hi {{first_name}},</p>", {});
  assert.match(output, /Hi there,/);
});

test("a written fallback is honoured at render time", async () => {
  const output = await render("<p>Hi {{first_name|friend}},</p>", {});
  assert.match(output, /Hi friend,/);
});

test("no rendered email carries a visible merge tag, whatever is thrown at it", async () => {
  const output = await render(
    "<p>{{first_name}} {{unknown_one}} {{another|}} {{ spaced }} {{discount_code}}</p>",
    { first_name: "Priya" },
  );
  assert.doesNotMatch(output, /\{\{|\}\}/, "no brace pair survives rendering");
});

test("the footer's unsubscribe link is a real URL, not a literal tag", async () => {
  // Renderer-controlled, so it never passed through block interpolation and
  // shipped as href="{{unsubscribe_url}}" — a visible link going nowhere.
  const output = await renderGeneratedEmail(
    { blocks: [{ id: "t", type: "text", props: { html: "<p>Hello</p>" } }] as never, subject: "S", previewText: "P" },
    brandKit,
    { variables: { unsubscribe_url: "https://joon.test/u/abc123" } },
  );
  assert.match(output, /href="https:\/\/joon\.test\/u\/abc123"/);
  assert.doesNotMatch(output, /\{\{unsubscribe_url\}\}/);
});

test("a preview with no recipient shows a dead link, never a raw tag", async () => {
  const output = await renderGeneratedEmail(
    { blocks: [{ id: "t", type: "text", props: { html: "<p>Hello</p>" } }] as never, subject: "S", previewText: "P" },
    brandKit,
    { variables: {}, previewMode: true },
  );
  assert.doesNotMatch(output, /\{\{unsubscribe_url\}\}/);
  assert.match(output, /href="#"[^>]*>\s*Unsubscribe/i);
});
