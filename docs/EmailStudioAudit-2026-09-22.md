# Email Studio — implementation audit and first pass

Recorded 2026-09-22T11:42:13Z. Branch `email-studio-block-ai`, based on `29cfce5`.

This is the audit the Email Studio brief asked for before any editing, plus what
the first pass changed. It records what is actually in the repository, verified
by reading and running it — not what the roadmap says should be there.

---

## 1. What already existed

More than the brief assumed. The Studio is not a greenfield build.

### Content model — `packages/email-builder`

A single canonical document, `emailDocumentSchema`: `{ schemaVersion, envelope
{subject, previewText, fromName, replyTo, locale}, blocks[], metadata }`.

Fifteen leaf block types already exist and are schema-validated: `text`,
`image`, `button`, `divider`, `spacer`, `product`, `product_grid`, `social`,
`header`, `footer`, `hero`, `icon_row`, `countdown`, `testimonial`,
`custom_html` — plus a recursive `columns` block. Every `props` object is
`.passthrough()`, so unknown keys survive round-trips.

`emailCommandSchema` also exists — a typed command list (`replaceText`,
`setStyle`, `replaceAsset`, `bindProduct`, `insertBlock`, `removeBlock`,
`moveBlock`, `setEnvelope`). **Nothing reads it.** It is a designed-but-unused
seam for structured operations.

### Editor — `apps/web/src/components/emails`

`EmailStudio.tsx` (311 lines), `BlockEditor.tsx` (350), `EmailPreviewFrame.tsx`
(157). Reached from `/templates/[id]/edit`, which its own comment calls "the ONE
email editor". Tabs: Ask / Inspect / Versions / Code / Preflight. It already had
undo/redo via local snapshots, durable versions, proposal before/after with
accept–reject, asset upload and a product list.

### Rendering — one path, already shared

`renderBrandedEmail` (`packages/customer-intelligence/src/content`) is the only
renderer. Studio preview (`emails.renderPreview`) and the delivery worker both
call it, through `@allohq/emails` React Email components. **Preview/delivery
parity was already real**, not something this pass had to create.

### Versioning and approval

- `EmailVersion` — `{sequence, document, contentHash, source}`, deduped by hash.
- `EmailProposal` — `{instruction, scope, operations, candidate, status,
  baseVersionId}`, resolved with optimistic concurrency: accepting a proposal
  whose `baseVersionId` is no longer the latest marks it `superseded` and
  refuses, rather than clobbering.
- `EmailApproval` — `{emailVersionId, renderHash, assetManifest, renderContext,
  preflight, approvedBy, approvedAt}`.
- `approval-finalize.ts` freezes all of it inside one `Serializable`
  transaction with a claim-once `updateMany`.

The brief's list of what an approved record "should be able to identify" was
already implemented, field for field.

### Preflight — `packages/email-builder/src/preflight.ts`

Six checks: subject present, preview text present, image alt text, links
structurally usable, custom HTML safe, offer matches the campaign.

### AI — `apps/api/src/routers/emails.ts`

`promptEdit` asks the model for **changes only** (per-block props keyed by id,
plus optional add/remove/order/subject), never a whole document — small JSON
that survives round-tripping. A generated-image branch persists assets with
provider, prompt and source lineage, and composites over the real product image
when a source asset is given.

---

## 2. What was actually broken, and why

The reported failure was `blocks[3].props.description` being `null` against a
schema expecting a string, surfacing as a Zod `invalid_union`.

**Reproduced exactly** before changing anything:

```
parse success: false
total issues: 1
code: invalid_union | path: [3] | msg: Invalid input
```

Two things made this hard to diagnose:

1. `emailBlockSchema` wraps its discriminated union in an outer `z.union([leaf,
   columns])`. When the leaf branch fails, the outer union reports
   `invalid_union` at the block index and **names neither `props` nor
   `description`**.
2. It was assumed to be legacy data. It is not.

### Root cause

`Product.description` and `Product.imageUrl` are nullable columns
(`schema.prisma`). `templates.getById` enriched product blocks by copying them
straight across:

```ts
block.props.description = product.description;   // String? → null
block.props.imageUrl    = product.imageUrl;      // String? → null
```

So **any** product without a description broke its email, on every fetch — a
live bug, reproducing continuously, not a historical artefact. The chain:
`getById` → null in the response → `EmailStudio` `safeParse` fails → preview
gone and `saveDraft` refused with "Invalid input".

### The fix

Narrow, in two parts.

1. **Stop creating them.** Enrichment omits an absent value instead of writing
   `null`.
2. **Tolerate the ones already stored.** `packages/email-builder/src/
   normalize.ts` converts `null` to absent at exactly the keys the schema
   already declares `.optional()` or `.default()` — derived by walking the Zod
   schema itself, so it cannot drift from a hand-maintained list.

This is deliberately **not** a loosening:

- a `null` in a *required* prop still fails (proven by test);
- unknown passthrough keys are untouched;
- the parse that follows is the unchanged schema;
- normalization is idempotent, so version content hashes stay stable.

Applied where stored email data re-enters: template read, version restore,
proposal candidate, and the canonical version writer.

### One delivery-path behaviour change — please review

`send.worker.ts` `frozenEmailDocument` did this:

```ts
const frozen = campaign.approvedEmailVersion ? safeParse(...) : null;
if (frozen?.success) return frozen.data;
return parse({ ...the LIVE template... });   // silent fallback
```

If an approved version failed to parse, delivery silently sent the **current
template instead of the approved one** — precisely the case the null bug would
trigger, and a breach of the immutability guarantee the rest of the system works
hard to keep. It now throws instead. Failing a send job is recoverable; sending
unapproved content is not.

This is the only change in this pass that alters delivery behaviour, and it is
flagged rather than buried.

---

## 3. What else this pass changed

### Ask-Joon scope: advisory → structural

`selectedBlockId` was passed to the model as a prompt hint, and the panel told
merchants their instruction would "target this block". **Nothing enforced it.**
A model that ignored the hint could rewrite the whole email.

Scope is now enforced twice, never by trusting the response:

- `containToScope` drops out-of-scope changes *before* anything is applied — a
  block-scoped request structurally cannot carry an add, remove, reorder or
  subject change;
- `scopeViolation` re-checks the result and refuses the proposal if anything
  outside the scope moved anyway.

Whole-email scope exists but is **never inferred** from a selection. The panel
shows a labelled radio group naming the boundary in the same words the server
enforces.

The parse → contain → lane → apply → re-check pipeline moved out of the router
into `apps/api/src/lib/email-changes.ts`, so the shipped path is the tested
path. The model cannot run in CI (no API key), so a parallel test
implementation would have proved nothing.

### Shopify facts: the model can no longer write them

A model edit to a product block was applied verbatim, so Joon could set a
title, price, description, image or destination no product has.

Merchant-owned props are now stripped from any model change — product identity
and facts, grid contents, CTA destinations, image sources. Joon keeps
everything editorial: wording, tone, layout, which fields show. A block it adds
arrives with **no product chosen** rather than an invented one, and a request
made only of invented facts is refused with the picker to use instead.

---

## 4. Concept PDF — adopted and not adopted

### Adopted

- **"Every block has two brains"** — Shopify supplies truth, AI supplies
  creation, per block. This is the organising principle behind the fact guard:
  the store owns what is true, Joon owns how it reads.
- Compact add-block rail, dominant centre canvas, selected-block inspector.
- Scope shown per block rather than one global prompt box.
- Four **separately selectable, labelled** generated assets — not a collage.

### Not adopted, deliberately

- **Its "Publish" button.** Joon's approval, preflight, audience preparation,
  holdout assignment, quiet hours, consent, suppression and delivery gates are
  more than a publish step and remain the only route to sending. No alternate
  send path was introduced.
- **Its visual identity** — the deck's emerald/serif Lumière styling. Joon's
  existing operator-console language stays.
- **Its literal copy and branding.**
- **Baking offer text into generated images.** `des/img/chatgenerated.png`
  shows "25% OFF" and "OCEAN25" rendered into the bitmap. That is the
  anti-pattern: a discount baked into pixels cannot be validated by preflight,
  changed after approval, or checked against the approved offer. Offer terms
  belong in structured blocks.

---

## 5. Pass 2 — personalization, Shopify truth, and visuals

### Merge tags were reaching the inbox

`interpolate` resolved an unknown token to the token itself:

```ts
variables[key] ?? `{{${key}}}`
```

So a tag the sender does not populate — a typo like `{{firstname}}`, or a
field Joon never had, like `{{city}}` — arrived as the visible text
"{{firstname}}". A token now resolves to its value, then a written fallback
(`{{first_name|friend}}`), then the field's default, then nothing. Never to
itself.

The token catalogue is limited to keys `send.worker` actually populates, and a
test asserts that, so Joon cannot offer personalization it has no value for.

### The footer's unsubscribe link was broken

Found while proving the above at the renderer. The footer is renderer-
controlled, never passed through interpolation, and shipped as:

```html
<a href="{{unsubscribe_url}}">Unsubscribe</a>
```

The `List-Unsubscribe` header was always correct, so mail-client unsubscribe
worked; **the visible link in the body went nowhere.** The older MJML path had
it right (`variables.unsubscribe_url ?? "#"`), so this was a regression in the
React path. Now resolved from the same variables, falling back to `#` in
preview.

### The editor was inviting the invention the server refuses

The product inspector asked merchants to type a title, description, image URL
and price; grids asked for "Product IDs (one per line)". Worse, those fields
did nothing: `resolveProduct` prefers `ctx.products[productId]` and ignores
block props, so a price typed there was silently overwritten before sending.

A **Shopify tab** now sits beside Edit and Ask Joon. A product is picked from
the store, only the reference is stored, and its facts read as facts with
their source. Grids pick products too. Text blocks insert personalization from
a list showing each field's sample and fallback.

### Visuals: four labelled assets, not one collage

`des/img/chatgenerated.png` is the failure being avoided — four good ideas
fused into one bitmap with "25% OFF" and "OCEAN25" baked into the pixels,
where no preflight can check them against the approved offer and no approval
can change them.

A request is now a list of named slots, each generated separately. Offer text
in a prompt is refused **before a paid call is made**, with the reason. Two
modes mean specific things: `product_safe` composites the real Shopify product
image and tells the generator not to draw the product at all; `creative_concept`
is labelled as a concept and may never be presented as product photography.

Preflight gained two checks: a token Joon cannot fill **blocks** approval; a
known token with no written fallback **warns**.

---

## 5b. Honest status of what still remains

| Item | Status |
|---|---|
| Collection binding | **Deliberately not built.** Nothing resolves a collection at render time — `resolveProduct`/the grid read `productIds` and `dynamicProducts` only. Offering it would have been a promise the renderer cannot keep. A collections API endpoint was written and then removed rather than left as dead code. |
| Frozen vs live data, surfaced | Not built as merchant-visible state. Approval freezes the document and brand kit; the distinction is real but not shown. |
| Contrast checking in preflight | Not built. |
| Asset OCR, malware scanning, EXIF stripping, moderation | **Absent, as the register already records.** No documentation correction was needed. Embedded text in generated images is prevented at the prompt rather than detected afterwards. |
| Real Gmail/Outlook/Apple Mail rendering evidence | Absent. Not claimed. |
| Per-campaign spend limit | Not built. The per-workspace **daily** image budget applies (`image-budget.ts`), and a request is capped at four slots. |
| Screenshots / visual walkthrough | **Not produced.** This repository has no browser in its test setup — component coverage is server-rendered markup via `renderToStaticMarkup`. Screenshots need manual verification against a running dev server. |
| Drag-to-reorder blocks | Not built. Reordering remains the existing up/down controls. |

## 6. Evidence

| Check | Result |
|---|---|
| Typecheck (19 tasks) | 19/19 pass |
| Unit tests | 498 pass, 0 fail |
| Integration (disposable Postgres + Redis) | 81 pass, 0 fail |
| Build | Green with CI's dummy Clerk key |
| Normalizer regression | 11/11 |
| Scope containment | 12/12 |
| Change pipeline + fact guard | 20/20 |
| Personalization | 14/14 |
| Renderer personalization + footer | 7/7 |
| Preflight | 10/10 |
| Visual request core | 18/18 |
| Visual generation (disposable Postgres) | 6/6 |
| Shopify data panel markup | 11/11 |
| Visual generator markup | 10/10 |
| Scope chooser markup | 7/7 |

The lifecycle integration test was verified non-vacuous: reverting the
enrichment fix fails it on "an absent product description must be absent, not
null".

CI has no image-provider keys, and an integration test asserts the honest
consequence rather than skipping: every slot fails, no asset is fabricated, no
stock image is quietly substituted, and no spend row is written.

All database work ran against a local disposable `joon_email_studio_test`
database. No production database, no provider, no recipients, no real sends.
