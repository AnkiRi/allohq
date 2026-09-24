# Operator configuration — asset storage and the model harness

Every provider is **unavailable until its credential AND its explicit enable
flag are both present**. A credential alone never switches a model on: an
existing OpenAI key must not silently start spending on a different, dearer
model because one was added to the registry.

Nothing in this document has been set by Joon. All of it is yours to decide.

---

## 1. Durable asset storage — required before ANY image work

Without this, uploads and generated images are refused **before** a provider is
called, so nothing is spent on output that cannot be saved.

The architecture, the IAM policies, the CORS and lifecycle rules, the
setup order and the production canary are in
[`docs/asset-storage/README.md`](asset-storage/README.md).

| Variable | Required | Notes |
|---|---|---|
| `ASSET_BUCKET` | yes | S3 or S3-compatible bucket name |
| `ASSET_CDN_BASE_URL` | yes | `https://assets.joonhq.com`, no trailing slash, never a provider hostname |
| `ASSET_AWS_ACCESS_KEY_ID` | yes* | Storage's own key (`iam-joon-api.json`); keeps it apart from SES |
| `ASSET_AWS_SECRET_ACCESS_KEY` | yes* | |
| `ASSET_REGION` | no | `eu-north-1` for the production bucket; falls back to `AWS_REGION`, then `us-east-1` |
| `ASSET_S3_ENDPOINT` | no | For S3-compatible stores (R2, MinIO). Forces path-style. Unset for AWS |

\* Or the generic `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, or an instance
role. Railway has no instance role.

**The production error named only the first two.** An operator could set both
and still have every upload fail on credentials. The capability check now
reports all of it.

Storage must be a bucket you control. Joon has created nothing.

---

## 2. Text models

| Model | Credential | Enable flag | Notes |
|---|---|---|---|
| Claude Sonnet | `ANTHROPIC_API_KEY` | — | Text and visual reasoning |
| GPT-4o | `OPENAI_API_KEY` | — | Text and visual reasoning |
| Gemini Flash | `GOOGLE_API_KEY` | `JOON_GEMINI_TEXT_ENABLED=true` | Economy tier |

All three have real adapters. The Gemini text adapter was written for this
pass; Gemini was previously listed with nothing behind it.

Existing Harness v1 configuration is **migrated, not discarded**: the single
`creative` route becomes all four creative workloads, and `support` plus
`orchestration` merge into `merchant_agent_orchestration`. No workspace loses
a route it had set.

---

## 3. Image models

Every model listed here has a **real adapter** behind it. Nothing appears in
the Studio, in routing, or as a fallback without one — a registry entry is not
an implementation.

### OpenAI — GPT Image 2.5

| Model | API id | Credential | Enable flag |
|---|---|---|---|
| GPT Image 2.5 Flare | `gpt-image-2.5-flare` | `OPENAI_API_KEY` | `JOON_OPENAI_IMAGE_ENABLED=true` |
| GPT Image 2.5 Sunburst | `gpt-image-2.5-sunburst` | `OPENAI_API_KEY` | `JOON_OPENAI_IMAGE_ENABLED=true` |
| GPT Image 1 (legacy) | `gpt-image-1` | `OPENAI_API_KEY` | `JOON_OPENAI_IMAGE_LEGACY_ENABLED=true` |

Flare is the everyday path; Sunburst the premium and reference-editing path.
With a reference the adapter posts multipart to `/v1/images/edits`; without
one, JSON to `/v1/images/generations`.

`dall-e-3` was removed. An account that cannot reach it is exactly how image
generation came to be configured and dead in production.

### Google — Nano Banana

| Model | API id | Credential | Enable flag |
|---|---|---|---|
| **Nano Banana 2** | `gemini-3.1-flash-image` | `GOOGLE_API_KEY` | `JOON_NANO_BANANA_ENABLED=true` |
| Nano Banana Pro | `gemini-3-pro-image` | `GOOGLE_API_KEY` | `JOON_NANO_BANANA_PRO_ENABLED=true` |

**Nano Banana 2 is the default for product work.** The adapter sends the real
Shopify product image as inline image data to `generateContent` — the product
reaches the model, it is not described to it.

### Removed

**Replicate / Flux.** Its generation path predates the adapter contract and
implements none, so listing it would be the false availability this system now
forbids. `REPLICATE_API_TOKEN` is no longer read by the harness.

### Costs

Models carry a **class** — economy, standard, premium — not a price. Providers
bill by tokens and tiers, so a printed "$0.04 per image" would be a number Joon
invented. Real usage is recorded from the provider's own response when it
returns any.

## 4. Budgets

| Variable | Default | Scope |
|---|---|---|
| `IMAGE_DAILY_BUDGET_USD` | `5` | Workspace, trailing 24h |
| `IMAGE_CAMPAIGN_BUDGET_USD` | `2` | One email template, lifetime |

Both fail closed on a missing or nonsensical value. Both apply across every
provider and model.

---

## 5. Verifying a provider without sending email

Nothing here sends email; these only exercise generation.

1. Set the credential and its enable flag on the **Railway `api` service**.
2. Open any email in the Studio, select an **image or hero** block (never a
   product block — its picture is a Shopify fact).
3. Visuals tab → confirm it no longer says generation is unavailable, and that
   the named provider is the one you configured.
4. Generate one visual.
5. Confirm the asset appears, is selectable, and survives save → reload.

Storage must be configured first, or step 3 will correctly refuse.

---

## 6. What is NOT yet claimed

- **No real generation has completed end to end.** Provider output → persisted
  object → Studio asset → block → save/reload → preview → approved version has
  never run, because storage is unconfigured in production. Image generation
  should not be described as operational until it has.
- **Image analysis / OCR** is registered as a capability but no adapter reads
  text from an image. Nothing claims it does.
- Malware scanning and content moderation remain absent.
