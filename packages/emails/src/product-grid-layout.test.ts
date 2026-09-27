import assert from "node:assert/strict";
import test from "node:test";
import { renderGeneratedEmail } from "./render";
import { buildBrandKit } from "./brand-kit";

test("a two-product grid stays side by side in a 600px desktop preview", async () => {
  const html = await renderGeneratedEmail(
    {
      subject: "Winter collection",
      previewText: "Two boards",
      blocks: [{ id: "grid", type: "product_grid", props: { productIds: ["a", "b"], columns: 2 } }] as never,
    },
    buildBrandKit(null, null),
    {
      products: {
        a: { id: "a", title: "Oxygen Snowboard", price: 100, imageUrl: "https://example.test/a.jpg" } as never,
        b: { id: "b", title: "Summit Snowboard", price: 120, imageUrl: "https://example.test/b.jpg" } as never,
      },
    },
  );

  assert.match(html, /max-width: 480px/, "mobile stacking begins below desktop email width");
  assert.doesNotMatch(html, /max-width: 600px[\s\S]*?\.bk-stack \{ display: block/, "desktop width must not trigger stacking");
  const first = html.indexOf("Oxygen Snowboard");
  const second = html.indexOf("Summit Snowboard");
  assert.ok(first > 0 && second > first, "both Shopify products render");
  assert.doesNotMatch(html.slice(first, second), /<\/tr>/i, "both products occupy the same grid row");
});
