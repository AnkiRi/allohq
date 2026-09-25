import test from "node:test";
import assert from "node:assert/strict";
import { geminiImageAdapter, buildGeminiImageRequest } from "./gemini-image";
import { openAiImageAdapter, openAiSize } from "./openai-image";
import { VisualAdapterError } from "./types";

/**
 * Contract tests, no live calls.
 *
 * The thing these must prove is the one that cannot be inferred from a
 * registry entry: that the merchant's REAL product bytes leave the process on
 * their way to the model. An adapter that describes the product in text would
 * pass every capability check and still return an invented product.
 */

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const reference = { bytes: PNG, mimeType: "image/png" };

type Captured = { url: string; init: RequestInit };
function mockFetch(handler: (captured: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const captured = { url: String(input), init: init ?? {} };
    calls.push(captured);
    return handler(captured);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function withKey<T>(name: string, run: () => Promise<T>): Promise<T> {
  const saved = process.env[name];
  process.env[name] = "test-key";
  return run().finally(() => {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  });
}

// --- Gemini ------------------------------------------------------------------

test("gemini sends the prompt AND the real reference bytes", () => {
  const built = buildGeminiImageRequest({
    apiModelId: "gemini-3.1-flash-image",
    prompt: "Place it on a beach",
    width: 1024, height: 1024,
    references: [reference],
  });
  const parts = built.body.contents[0]!.parts;
  assert.equal((parts[0] as { text: string }).text, "Place it on a beach");
  const inline = parts[1] as { inline_data: { mime_type: string; data: string } };
  assert.equal(inline.inline_data.mime_type, "image/png");
  assert.equal(inline.inline_data.data, PNG.toString("base64"), "the actual product bytes, not a description");
  assert.match(built.url, /models\/gemini-3\.1-flash-image:generateContent$/);
});

test("gemini carries multiple references when given them", () => {
  const built = buildGeminiImageRequest({
    apiModelId: "gemini-3-pro-image", prompt: "Combine these", width: 1024, height: 1024,
    references: [reference, { bytes: Buffer.from("ffd8ff", "hex"), mimeType: "image/jpeg" }],
  });
  const parts = built.body.contents[0]!.parts;
  assert.equal(parts.length, 3, "prompt + two images");
});

test("gemini converts an inline image response into the common result", async () => {
  const mock = mockFetch(() =>
    json({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }],
      usageMetadata: { totalTokenCount: 1234 },
    }),
  );
  try {
    const result = await withKey("GOOGLE_API_KEY", () =>
      geminiImageAdapter.generate({
        apiModelId: "gemini-3.1-flash-image", prompt: "p", width: 1024, height: 1024,
        references: [reference],
      }),
    );
    assert.equal(result.imageBase64, "QUJD");
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.usage?.tokens, 1234, "reported usage is recorded, never invented");
    assert.match(String(mock.calls[0]!.init.body), /inline_data/, "bytes really went out");
  } finally {
    mock.restore();
  }
});

test("gemini reports an account problem as an account problem", async () => {
  const mock = mockFetch(() => json({ error: { message: "model not found for this project" } }, 404));
  try {
    await withKey("GOOGLE_API_KEY", async () => {
      await assert.rejects(
        () => geminiImageAdapter.generate({ apiModelId: "gemini-3-pro-image", prompt: "p", width: 1024, height: 1024 }),
        (error: VisualAdapterError) => {
          assert.equal(error.kind, "not_permitted");
          assert.match(error.merchantMessage, /not enabled on the connected account/);
          assert.doesNotMatch(error.merchantMessage, /GOOGLE_API_KEY|gemini-3|404/);
          return true;
        },
      );
    });
  } finally {
    mock.restore();
  }
});

test("gemini surfaces a safety block as a request to rephrase", async () => {
  const mock = mockFetch(() => json({ promptFeedback: { blockReason: "SAFETY" } }));
  try {
    await withKey("GOOGLE_API_KEY", async () => {
      await assert.rejects(
        () => geminiImageAdapter.generate({ apiModelId: "gemini-3.1-flash-image", prompt: "p", width: 1024, height: 1024 }),
        (error: VisualAdapterError) => {
          assert.equal(error.kind, "rejected");
          assert.match(error.merchantMessage, /describing the scene differently/);
          return true;
        },
      );
    });
  } finally {
    mock.restore();
  }
});

test("gemini with no image part fails rather than returning nothing", async () => {
  const mock = mockFetch(() => json({ candidates: [{ content: { parts: [{ text: "sorry" }] } }] }));
  try {
    await withKey("GOOGLE_API_KEY", async () => {
      await assert.rejects(() =>
        geminiImageAdapter.generate({ apiModelId: "gemini-3.1-flash-image", prompt: "p", width: 1024, height: 1024 }),
      );
    });
  } finally {
    mock.restore();
  }
});

test("gemini without a credential refuses before any request", async () => {
  const saved = process.env["GOOGLE_API_KEY"];
  delete process.env["GOOGLE_API_KEY"];
  const mock = mockFetch(() => json({}));
  try {
    await assert.rejects(
      () => geminiImageAdapter.generate({ apiModelId: "gemini-3.1-flash-image", prompt: "p", width: 1024, height: 1024 }),
      (error: VisualAdapterError) => {
        assert.equal(error.kind, "unavailable");
        return true;
      },
    );
    assert.equal(mock.calls.length, 0, "no network call without a credential");
  } finally {
    mock.restore();
    if (saved) process.env["GOOGLE_API_KEY"] = saved;
  }
});

// --- OpenAI ------------------------------------------------------------------

test("openai uses the edits endpoint and uploads the real bytes for a reference", async () => {
  const mock = mockFetch(() => json({ data: [{ b64_json: "WFla" }] }));
  try {
    const result = await withKey("OPENAI_API_KEY", () =>
      openAiImageAdapter.generate({
        apiModelId: "gpt-image-2.5-sunburst", prompt: "On a beach",
        width: 1536, height: 1024, references: [reference],
      }),
    );
    assert.match(mock.calls[0]!.url, /\/images\/edits$/, "editing FROM the product, not generating about it");
    assert.ok(mock.calls[0]!.init.body instanceof FormData, "multipart upload of the image");
    const form = mock.calls[0]!.init.body as FormData;
    assert.equal(form.get("model"), "gpt-image-2.5-sunburst");
    assert.equal(form.get("prompt"), "On a beach");
    assert.ok(form.get("image[]"), "the reference image is attached");
    assert.equal(result.imageBase64, "WFla");
  } finally {
    mock.restore();
  }
});

test("openai uses the generations endpoint without a reference", async () => {
  const mock = mockFetch(() => json({ data: [{ b64_json: "QQ==" }] }));
  try {
    await withKey("OPENAI_API_KEY", () =>
      openAiImageAdapter.generate({ apiModelId: "gpt-image-2.5-flare", prompt: "A beach", width: 1024, height: 1024 }),
    );
    assert.match(mock.calls[0]!.url, /\/images\/generations$/);
    const body = JSON.parse(String(mock.calls[0]!.init.body));
    assert.equal(body.model, "gpt-image-2.5-flare");
    assert.equal(body.size, "1024x1024");
  } finally {
    mock.restore();
  }
});

test("openai turns organisation verification into a merchant-safe message", async () => {
  const mock = mockFetch(() =>
    json({ error: { message: "Your organization must be verified to use gpt-image-2.5-flare" } }, 403),
  );
  try {
    await withKey("OPENAI_API_KEY", async () => {
      await assert.rejects(
        () => openAiImageAdapter.generate({ apiModelId: "gpt-image-2.5-flare", prompt: "p", width: 1024, height: 1024 }),
        (error: VisualAdapterError) => {
          assert.equal(error.kind, "not_permitted");
          assert.match(error.merchantMessage, /not enabled on the connected account/);
          assert.doesNotMatch(error.merchantMessage, /organization|verif|OPENAI/i);
          return true;
        },
      );
    });
  } finally {
    mock.restore();
  }
});

test("sizes map to ones the endpoints accept", () => {
  assert.equal(openAiSize(1536, 1024), "1536x1024");
  assert.equal(openAiSize(1024, 1536), "1024x1536");
  assert.equal(openAiSize(1024, 1024), "1024x1024");
});

test("no adapter ever puts a credential in a merchant message", async () => {
  const mock = mockFetch(() => json({ error: { message: "boom" } }, 500));
  try {
    for (const [key, adapter, model] of [
      ["GOOGLE_API_KEY", geminiImageAdapter, "gemini-3.1-flash-image"],
      ["OPENAI_API_KEY", openAiImageAdapter, "gpt-image-2.5-flare"],
    ] as const) {
      await withKey(key, async () => {
        await assert.rejects(
          () => adapter.generate({ apiModelId: model, prompt: "p", width: 1024, height: 1024 }),
          (error: VisualAdapterError) => {
            assert.doesNotMatch(error.merchantMessage, /API_KEY|Bearer|test-key|http/i);
            return true;
          },
        );
      });
    }
  } finally {
    mock.restore();
  }
});
