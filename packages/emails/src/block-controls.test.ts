import assert from "node:assert/strict";
import test from "node:test";
import { renderGeneratedEmail } from "./render";
import { buildBrandKit } from "./brand-kit";

test("a full-width larger button changes the HTML actually used for delivery", async () => {
  const html = await renderGeneratedEmail({ blocks: [{
    id: "cta", type: "button", props: {
      text: "Shop now", href: "https://shop.test", fullWidth: true,
      fontSize: 22, paddingX: 30, paddingY: 24,
    },
  }] } as never, buildBrandKit(null, null));
  assert.match(html, /font-size:22px/);
  assert.match(html, /width:100%/);
  assert.match(html, /padding:24px 30px/);
});

test("divider thickness and spacing affect delivery instead of being ignored", async () => {
  const html = await renderGeneratedEmail({ blocks: [{
    id: "rule", type: "divider", props: { thickness: 4, margin: 32, color: "#112233" },
  }] }, buildBrandKit(null, null));
  assert.match(html, /border-top:4px solid #112233/);
  assert.match(html, /padding:32px 36px 0/);
});
