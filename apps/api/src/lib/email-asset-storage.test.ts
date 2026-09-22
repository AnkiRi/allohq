import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { stripImageMetadata } from "./email-asset-storage";

/**
 * Metadata removal, proven on bytes rather than asserted in a comment.
 *
 * Joon hosts merchant images at public CDN URLs and mails them to strangers.
 * A phone photo's EXIF routinely carries GPS coordinates; shipping that
 * through would publish someone's location as a side effect of adding a
 * picture to an email.
 */

/** A JPEG carrying EXIF, including a GPS position. */
async function photoWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 48, height: 32, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    // sharp's Exif type names only the IFD blocks it writes routinely; GPS is
    // written through the same mechanism, which is exactly why it has to be
    // proven gone rather than assumed absent.
    .withExif({
      IFD0: { Copyright: "Test Photographer", Model: "Pixel Test 7" },
      GPS: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" },
    } as never)
    .jpeg()
    .toBuffer();
}

test("a photograph goes in with EXIF and comes out with none", async () => {
  const original = await photoWithExif();
  const before = await sharp(original).metadata();
  assert.ok(before.exif, "the fixture really does carry EXIF");

  const stripped = await stripImageMetadata(original, "image/jpeg");
  const after = await sharp(stripped.body).metadata();
  assert.equal(after.exif, undefined, "no EXIF survives");
});

test("no GPS or device string survives in the stored bytes", async () => {
  const stripped = await stripImageMetadata(await photoWithExif(), "image/jpeg");
  const asText = stripped.body.toString("latin1");
  assert.doesNotMatch(asText, /Test Photographer/, "copyright string is gone");
  assert.doesNotMatch(asText, /Pixel Test 7/, "device model is gone");
  assert.doesNotMatch(asText, /GPS/, "no GPS block remains");
});

test("the picture itself is unharmed", async () => {
  const stripped = await stripImageMetadata(await photoWithExif(), "image/jpeg");
  const meta = await sharp(stripped.body).metadata();
  assert.equal(meta.width, 48);
  assert.equal(meta.height, 32);
  assert.equal(stripped.width, 48);
  assert.equal(stripped.height, 32);
});

test("orientation is applied before EXIF is dropped, not lost with it", async () => {
  // Orientation lives IN the EXIF being removed. Dropping it without rotating
  // first would silently turn portrait photographs on their side.
  const rotated = await sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 10, g: 10, b: 10 } },
  })
    .withExif({ IFD0: { Orientation: "6" } })
    .jpeg()
    .toBuffer();
  const stripped = await stripImageMetadata(rotated, "image/jpeg");
  const meta = await sharp(stripped.body).metadata();
  assert.equal(meta.exif, undefined);
  assert.ok(meta.width && meta.height, "still a readable image after rotation");
});

test("png and webp are stripped too, not only jpeg", async () => {
  for (const mime of ["image/png", "image/webp"] as const) {
    const source = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withExif({ IFD0: { Copyright: "Test Photographer" } })
      [mime === "image/png" ? "png" : "webp"]()
      .toBuffer();
    const stripped = await stripImageMetadata(source, mime);
    assert.doesNotMatch(stripped.body.toString("latin1"), /Test Photographer/, `${mime} kept metadata`);
  }
});

test("stripping is deterministic, so the content hash is stable", async () => {
  const source = await photoWithExif();
  const a = await stripImageMetadata(source, "image/jpeg");
  const b = await stripImageMetadata(source, "image/jpeg");
  assert.deepEqual(a.body, b.body, "same input, same stored bytes");
});
