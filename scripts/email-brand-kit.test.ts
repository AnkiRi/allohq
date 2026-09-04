import assert from "node:assert/strict";
import test from "node:test";
import { buildBrandKit } from "../packages/emails/src/brand-kit";

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
