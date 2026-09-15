import assert from "node:assert/strict";
import test from "node:test";
import { buildBrandKit, formatCurrency } from "../packages/emails/src/brand-kit";
import { formatProductsForPrompt } from "../packages/customer-intelligence/src/content/prompt-templates";

test("explicit onboarding design tokens drive the rendered email brand kit", () => {
  const kit = buildBrandKit(
    { brandName: "Ankita & Co" },
    {
      primaryColors: ["#111111"],
      accentColors: ["#222222"],
      fontFamily: "Georgia",
      bodyFontFamily: "Arial",
      brandDesignTokens: {
        ctaBackground: "#C04B32",
        accentColor: "#276749",
        headingFont: "Playfair Display",
        bodyFont: "Inter",
      },
    },
  );

  assert.equal(kit.colors.primary, "#c04b32");
  assert.equal(kit.colors.secondary, "#276749");
  assert.match(kit.fonts.serif, /^'Playfair Display'/);
  assert.match(kit.fonts.sans, /^Inter/);
});

test("connected store currency drives product prices in prompts and rendered email blocks", () => {
  const kit = buildBrandKit(null, null, { currency: "USD" });

  assert.equal(kit.currency, "USD");
  assert.equal(formatCurrency(1299, kit.currency), "$1,299.00");
  assert.match(
    formatProductsForPrompt([{ id: "snowboard", title: "Snowboard", price: 1299 }], undefined, "USD"),
    /\$1,299\.00/,
  );
  assert.match(formatCurrency(1299, "INR"), /₹1,299\.00/);
});
