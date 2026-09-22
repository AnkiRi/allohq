# Email Studio — configuration reference

Recorded 2026-09-22T14:55:10Z. Applies to branch `email-studio-block-ai` (PR #36).

Everything below is optional. With none of it set, the Studio works: merchants
edit, bind Shopify data, preview, preflight and approve. Only image generation
is unavailable, and it says so rather than substituting a stand-in.

---

## Image generation

### Nothing set

Generation refuses with the reason and names what to set. No stock image is
returned, no spend row is written, and the panel disables the button rather
than letting a merchant press it and receive a placeholder.

### Text-to-image (a generated setting, product composited afterwards)

| Variable | Effect |
|---|---|
| `REPLICATE_API_TOKEN` | Enables **Flux 1.1 Pro**. ~$0.05/image. |
| `OPENAI_API_KEY` | Enables **DALL·E 3**. ~$0.04/image. |

In product-safe mode with either of these, Joon generates the setting only,
then composites the real Shopify product image over it. The product is exact;
its placement is assembled rather than photographed.

### Reference-grounded (the real product image is an input to the model)

Each needs its API key **and** an explicit opt-in, so an existing key cannot
silently redirect spend to a different, dearer model.

| Provider | Variables | Cost |
|---|---|---|
| Flux Kontext (Replicate) | `REPLICATE_API_TOKEN` + `JOON_FLUX_KONTEXT_ENABLED=true` | ~$0.06/image |
| OpenAI gpt-image-1 | `OPENAI_API_KEY` + `JOON_OPENAI_IMAGE_REFERENCE_ENABLED=true` | ~$0.07/image |

With one of these active, product-safe mode sends the product image as a
reference and instructs the model to change only what surrounds it. The panel
then says the product in the scene is the merchant's, rather than describing
compositing.

**Not verified against a live provider.** Neither adapter has been run against
the real API from this environment — there are no credentials here and paid
generation is not run in CI. The selection logic, capability reporting,
prompt construction and failure handling are covered by tests; the network
call itself is the part that needs a first real run. See "Manual acceptance".

### Spend ceilings

| Variable | Default | Scope |
|---|---|---|
| `IMAGE_DAILY_BUDGET_USD` | `5` | Whole workspace, trailing 24h |
| `IMAGE_CAMPAIGN_BUDGET_USD` | `2` | One email template, lifetime |

Both fail closed on a missing or nonsensical value. The per-email ceiling
exists so iterating on one hero image cannot consume the allowance every other
email depends on.

---

## What is NOT implemented, and is claimed nowhere

| | Status |
|---|---|
| EXIF / metadata stripping | **Implemented.** Both upload and generated-image paths re-encode through sharp; proven on bytes in `email-asset-storage.test.ts`. |
| Malware scanning | **Absent.** No scanner, no reference. Preflight does not mention it; a test asserts no check ever says so. |
| Content moderation | **Absent.** `BrandAsset.status` is an upload lifecycle, not a verdict. |
| OCR / text inside generated images | **Absent.** Prevented at the prompt instead: offer wording, codes and prices are refused before a paid call. Preflight states the limitation ("Joon does not read text inside images") rather than implying a check. |
| Real Gmail / Outlook / Apple Mail rendering | **Absent.** No client-rendering service is configured. |

---

## Manual acceptance — what needs a person

1. **One real reference generation.** Set one reference provider's variables,
   bind a product with an image, and generate in product-safe mode. Confirm the
   product in the output is genuinely the merchant's. This is the only claim in
   the Studio that has not been verified end to end, because it needs a paid
   call.
2. **A Shopify store with collections synced.** Collection resolution is tested
   against seeded Postgres rows; a real sync confirms the join and ordering
   match what Shopify shows.
3. **The Studio under an authenticated session.** The browser verification ran
   the real components with fixtures at the network boundary, because a Clerk
   session is a credential this environment does not have and production Clerk
   must not be used for testing. Auth, the live API and the database round trip
   are covered by the integration suite instead.
4. **A test send to 2–3 addresses you control**, once a sender domain is ready.
   Nothing in this pass sends email.
