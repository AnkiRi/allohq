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

| Variable | Required | Notes |
|---|---|---|
| `ASSET_BUCKET` | yes | S3 or S3-compatible bucket name |
| `ASSET_CDN_BASE_URL` | yes | Public base URL, no trailing slash |
| `AWS_ACCESS_KEY_ID` | yes* | |
| `AWS_SECRET_ACCESS_KEY` | yes* | |
| `ASSET_REGION` | no | Falls back to `AWS_REGION`, then `us-east-1` |
| `ASSET_S3_ENDPOINT` | no | For S3-compatible stores (R2, MinIO). Forces path-style |

\* Or an instance role. Railway has none, so on Railway these are required.

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

The existing text harness is unchanged. This registry sits alongside it.

---

## 3. Image models

### Text-to-image — invents whatever it draws

| Model | API id | Credential | Enable flag | ~Cost |
|---|---|---|---|---|
| GPT Image | `gpt-image-1` | `OPENAI_API_KEY` | — | $0.07 |
| DALL·E 3 | `dall-e-3` | `OPENAI_API_KEY` | — | $0.04 |
| Flux 1.1 Pro | `black-forest-labs/flux-1.1-pro` | `REPLICATE_API_TOKEN` | — | $0.05 |

### Reference-grounded — your real product reaches the model

| Model | API id | Credential | Enable flag | ~Cost |
|---|---|---|---|---|
| **Nano Banana 2** | `gemini-3.1-flash-image` | `GOOGLE_API_KEY` | `JOON_NANO_BANANA_ENABLED=true` | $0.04 |
| Nano Banana Pro | `gemini-3-pro-image` | `GOOGLE_API_KEY` | `JOON_NANO_BANANA_PRO_ENABLED=true` | $0.14 |
| GPT Image | `gpt-image-1` | `OPENAI_API_KEY` | `JOON_OPENAI_IMAGE_REFERENCE_ENABLED=true` | $0.07 |
| Flux Kontext | `black-forest-labs/flux-kontext-pro` | `REPLICATE_API_TOKEN` | `JOON_FLUX_KONTEXT_ENABLED=true` | $0.06 |

**Nano Banana 2 is the intended default for product work** once configured —
it takes references, handles multiple references, and sits at the same price as
DALL·E. Nano Banana Pro is the premium option for final campaign assets.

**Claude is deliberately absent from every image capability.** The Anthropic
API does not return images; offering it would be a promise the API cannot keep.
A test asserts this.

---

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
