# Campaign and Email Studio UX review

27 September 2026. Design input, not an approved redesign. Evidence is the merchant's live test plus a source audit at `b6a2fc1`; code-only observations are not claimed as browser-tested.

## Core problem

The merchant wants to prepare a campaign, edit its email, see the result, save, return to the same place and approve safely. Instead they must track campaign tabs, editor tabs, selected blocks, manual edits, Joon proposals, generated files, saved versions, the campaign version and the approved version. These states look similar but have different consequences. Simplify representation, not safety capability.

## Observed and confirmed

| Finding | Evidence | Status |
| --- | --- | --- |
| While a button-text proposal was pending, adding an image changed “Before” but not “Proposed”; deletion looked ineffective until rejection and save. | Live test; whole-document proposal snapshots confirmed in Studio code. | Narrow fix in this branch makes the current draft win when the proposal becomes stale. |
| A visible selected image could say “Nothing selected.” | Live test; the inspector read current blocks while the canvas could show proposal-only blocks. | Narrow fix prevents proposal-only blocks from opening a false inspector. |
| Two Shopify products stacked in the desktop “grid.” | Live test; the CSS stack breakpoint equalled the 600px desktop preview. | Narrow CSS fix; actual inbox-client seed check remains. |
| The Shopify product photo could not be changed by Ask Joon. | Live test and code. | Correct rule. Rejection copy should lead to creating a separate campaign image, not tell the user to re-pick an already bound product. |
| A prompt to draw “25% off” into an image was refused. | Live test and code. | Correct rule. Offer terms must remain editable and checked; make the recovery path shorter. |
| Two generated visuals persisted after leaving and reopening. | Live test. | Works; product choice and visual conversation/history remain UX gaps. |
| Editor Back reopened Campaign Overview rather than Message. | Live test; campaign section was local-only state. | Narrow URL-state fix in this branch. |

## States the UI must distinguish

1. Current draft: manual edits and chosen assets; the only thing Save version writes.
2. Joon suggestion: optional content edit that changes nothing until accepted. A stale suggestion must never cover or overwrite the current draft.
3. Generated asset: a store-wide library file; generation, choosing and saving are separate actions.
4. Saved version: recoverable email, not permission to send.
5. Campaign-attached version: the version this campaign is reviewing.
6. Approved version: immutable email, audience, offer, timing and holdout.

Canvas, inspector, Save and preview must refer to the same state. Accept/Reject makes sense for a Joon text edit, as the merchant found with the button label. It is ceremony for a manual edit or choosing a generated image. Do not remove it globally; narrow it to changes that need review and show the affected field or block rather than a whole-email snapshot.

## Campaign route: every current section

| Section | Merchant's job | Design issue and target |
| --- | --- | --- |
| Overview | State and next action. | Do not force it after editor return. Keep a compact summary and preserve the user's place. |
| Message | See the exact email and edit it. | Campaign → Message → Edit → Back → Message is already too much travel. Bring email status and key actions into one task-led flow. |
| Audience | Examine eligible, excluded, treatment and control. | Keep arithmetic and customer-level reasons, but expose the decision summary next to the email/approval; expand detailed evidence in place. |
| Delivery | Review sender, time, timezone, ramp and gates. | “Review delivery” should land here. Critical failure and low-confidence timing choices must be visible without hunting for this tab. |
| Results | See delivery and causal outcomes. | Before launch show the measurement plan, not empty outcome tiles. After launch distinguish sends, attribution and treatment/control evidence. |
| Receipt | Verify what was approved and what happened. | Keep durable proof, but make the immediate approval receipt available in context instead of requiring a tab visit. |

The preparation progress/recovery section is outside these six tabs. Its relationship to approval and delivery needs an explicit place in the workflow. A future design may use one task-led page with expandable evidence, but must preserve all six information families and deep links.

## Studio shell and navigation

- **Top bar:** Back, title, saved/unsaved, Undo/Redo, Preview, Save version and Review delivery compete. Back must retain campaign context. “Preview” opens a full email while the centre is also a “Live preview”; distinguish working canvas from device/full-screen review. The saved badge must not imply a pending suggestion is saved.
- **Outline:** add/select/move/delete are useful. Selecting on outline or canvas should open the same inspector. Deleting a block must remove it from the *draft* preview immediately even when AI has an old candidate. Keep selection stable as siblings move.
- **Canvas:** desktop/mobile, light/dark and Edit/Fit make six combinations before the full preview. These are real QA tools but not equal-priority composition controls. The default canvas should be the actual draft.
- **Mobile/compact:** outline disappears and tools become a drawer. At 390px, upload, select, edit, preview and save still need a usable path. Do not merely discourage mobile without a workable fallback.
- **Navigation:** Save says which version it creates; Back retains the campaign section; Review delivery opens the delivery review. Warn about leaving only for genuinely unsaved draft work.

## Studio tools: all seven current tabs

| Tab | Current job | What needs design work |
| --- | --- | --- |
| Edit | Selected block fields. | Primary inspector. Show fields that affect the sent artifact; store-owned facts should read as facts, not editable-looking stale copies. |
| Shopify | Product, variant, collection and personalization. | Two different jobs behind a provider name. Put product binding with the product block and tokens beside the text field they modify. Clearly show collection precedence over hand-picked products. |
| Ask Joon | Instruction, scope, prompt chips, references, history and proposals. | Today it is a one-prompt form plus log, not an easy conversation. Users expect to revisit/refine an old visual and use it. Make scope and current output obvious; keep history and lineage. |
| Visuals | Generate, upload, library, product-safe/creative mode and advanced four-slot form. | Show which product and source photo ground a paid generation when multiple products exist. Separate store photo, derived scene and invented concept before choosing. |
| Checks | Preflight. | Failures should link to exact fields and be visible at campaign approval without a tab visit. Passing checks can stay quiet. |
| Versions | Session snapshots and saved versions. | Undo, saved version, campaign-attached version and approved version need explicit labels. Retain durable recovery but demote from the everyday tab row. |
| Code | Validated JSON and Custom HTML. | Advanced-only, reached from a selected block; not a normal step in composing an email. |

## Block-by-block inventory

| Block | Keep | Specific UX question |
| --- | --- | --- |
| Hero | Heading, subtext, CTA, background and alignment. | Separate artwork from copy/link; generated art must not silently change either. |
| Text | Direct copy, alignment and size. | Show Joon's text diff in this block, not as a whole-email before/after. |
| Image | Generate, upload, library, alt text, width, link and alignment. | Make source choice one coherent action. Show selected thumbnail/origin; removal must be immediate and reliable. |
| Button | Label, link and alignment. | Accept/Reject can work for wording; destination stays merchant-controlled and visible at approval. |
| Product | Shopify facts/photo plus editorial presentation and CTA. | “Photo comes from Shopify” should lead directly to “Create separate campaign image,” not “pick product again.” |
| Product grid | Hand-picked products or live collection, 2/3 columns, price/description. | Desktop must actually be a grid; phone may stack. Explain collection precedence, freeze point and missing-product behavior. |
| Testimonial | Quote, author and rating. | Do not let AI wording imply unverified customer evidence. |
| Reasons/icon row | Repeating icons, labels and descriptions. | Nested item add/remove must stay discoverable and keyboard-operable. |
| Divider | Separation. | Minimal inspector; select/move/delete from outline or canvas. |
| Spacer | Height. | Show its impact without making empty space impossible to select. |
| Custom HTML | Validated email-safe markup. | Advanced path with clear sanitization and no bypass around approval checks. |

The underlying model has block types beyond the add-block menu. Inventory them before promising each as a merchant-facing feature.

## Visuals, facts and proposal decisions

The safety rule is sound: a Shopify product block uses the real store image at delivery. A product-safe campaign scene is editorial content in a separate image/hero block. The merchant successfully generated a snowboard scene against a real product, but free-text naming of a product is not an explicit binding. When the email has several products, show the chosen product name/source image *before* the paid call and allow an explicit choice. Keep resulting images in the store-wide library with prompt, source and version lineage.

Do not bake a discount, code, price or deadline into pixels. On refusal, explain that offer text belongs in an editable block and offer a short route to produce the art without the claim, then add/check the offer separately. Generating a file, choosing it for an email and saving that email are different states.

Do not delete Accept/Reject globally yet. It worked for the merchant's button-text instruction. The failure is a whole-document candidate staying visible after unrelated manual changes. A redesign should review the affected block/field, name the actual difference and allow one clear choice. Manual edits and image placement simply need choose/remove/save. When a suggestion becomes stale, keep the merchant's new work, stop displaying the old candidate and offer a simple clear/regenerate action. The narrow fix here covers the display/selection part, not proposal storage or a full visual conversation.

## Acceptance journeys for the later redesign

1. Campaign → Message → Edit → change text → save → Back returns to Message, showing the saved text on first load.
2. Ask Joon to change a button → inspect exact change → reject; repeat → accept. Images and unrelated blocks remain untouched.
3. With a suggestion pending, add/delete an image, save and refresh. The current draft remains visible; no old snapshot resurrects the image.
4. Bind two Shopify products to a grid. Desktop preview puts them side by side; phone preview stacks; seed email confirms inbox behavior.
5. Select a Shopify product → create a separate product-safe visual → choose a variant → save → leave and reopen. Original store photo is unchanged.
6. Ask for a visual with “25% off”; receive an image-only path plus an editable offer-text path.
7. Revisit and refine an earlier visual output, choose another, then compare saved versions without losing the draft.
8. Review exact email, audience, timing and measurement without repeated context resets. Approval still blocks unsaved content and critical failures.
9. Repeat core edit/preview/save at 390px, 200% zoom and keyboard-only.

## Separate design deliverable

Build a dedicated interactive review page that tries a task-led campaign path and a unified Studio source/AI interaction in Joon's current visual world. Review it with the founder before changing production layout. Preserve approval immutability, Shopify-owned facts, preflight, treatment/control, version history and delivery safeguards. The goal is fewer navigation decisions, not fewer facts or weaker control.
