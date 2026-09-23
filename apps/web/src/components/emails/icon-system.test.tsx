import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The Studio uses one icon set (lucide-react) at two sizes:
 *
 *   h-4 w-4      an icon standing on its own — icon-only buttons, primary tabs
 *   h-3.5 w-3.5  an icon beside a label in a compact control, or a status glyph
 *
 * A third size had crept in (h-3) doing the same job as h-3.5, and several
 * icons appeared at two sizes in the same surface. These assertions keep the
 * scale from growing again, which is what makes an interface look assembled
 * rather than designed.
 */
const STUDIO = __dirname;
const SETTINGS = join(__dirname, "..", "settings");

function sources(dir: string): Array<{ name: string; text: string }> {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
    .map((file) => ({ name: file, text: readFileSync(join(dir, file), "utf8") }));
}

const files = [...sources(STUDIO), ...sources(SETTINGS)];

test("the Studio draws its icons from one library", () => {
  for (const file of files) {
    const imports = file.text.match(/from "([^"]*icons?[^"]*)"/g) ?? [];
    for (const line of imports) {
      assert.match(line, /lucide-react/, `${file.name} pulls icons from ${line}`);
    }
  }
});

test("icons use two sizes, not three", () => {
  for (const file of files) {
    const sizes = file.text.match(/h-[0-9.]+ w-[0-9.]+(?= |"|`)/g) ?? [];
    const iconSizes = sizes.filter((size) => /^h-[0-4](\.5)? /.test(size));
    for (const size of iconSizes) {
      assert.ok(
        ["h-4 w-4", "h-3.5 w-3.5"].includes(size),
        `${file.name} uses ${size}; the icon scale is h-4 or h-3.5`,
      );
    }
  }
});

test("no icon is drawn as raw SVG or as an emoji standing in for one", () => {
  for (const file of files) {
    assert.doesNotMatch(file.text, /<svg/, `${file.name} hand-rolls an icon`);
  }
});
