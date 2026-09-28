# Studio consistency pass — 28 September 2026

Surface: Operate. Preserve the existing brand and Studio layout; make each visible control
have one understandable effect. This is not the complete Studio redesign.

## Reported issues and the changes

| Report | Cause found | Change |
| --- | --- | --- |
| Creating a product picture leaves a large blank area | Panel navigation used page-wide scrollIntoView; previews also accepted height messages from other frames and measured a viewport-dependent height | Scroll only the tools panel. Each frame accepts only its own messages and measures a natural-height content wrapper |
| A requested product scene contains a different product | The product-scene action retained an ID but left the generation mode illustrative; unrelated selections could also inherit the first product in the email | Bind the new image block to the exact selected product. Fetch it by ID, show its photo/title, and require reference-capable generation when a product or library reference is selected |
| Duplicate filenames make reference selection unintelligible | The old picker showed names without pictures; copy assistance displayed references it did not actually use | Thumbnail-based single reference selection in Picture only. Its chosen bytes reach the image adapter. Copy assistance no longer presents a false reference control |
| Two image prompt locations | Image blocks displayed both copy assistance and image generation | One picture prompt by default; image blocks use Picture, not a second copy-assistance prompt |
| Countdown has no content controls | The editor lacked a countdown branch | Editable label and end date/time; explain that the email contains a rendered remaining-time value, not a continuously running inbox timer |
| Larger/full-width button proposal has no effect | The schema accepted fullWidth, but the delivery renderer ignored it; invented property names could also create invisible proposals | Render actual width, type size and padding controls. Give the model the same property contract. Refuse unsupported/no-op changes instead of reporting a pending suggestion |
| Spacer-to-border Ask Joon does nothing | Block type conversion was not a supported single-block prop edit | Remove copy assistance from Spacer/Divider. Provide explicit spacing/divider controls and a real replace-space-with-divider action |
| Content can appear after the footer | Legacy header/footer blocks remained selectable even though actual brand chrome belongs to the renderer | Exclude legacy chrome from editable content. Show the actual fixed footer after all content and link its selection to existing Brand settings |
| Version chips imply history without an obvious way to inspect it | Durable history had Restore, but no separate read-only View | Add View alongside Restore; label the source/version of the inbox preview |

## Reference and safety contract

- Product facts and the original Shopify photo remain store-owned. A generated campaign
  picture belongs in a separate image block.
- Selecting a product or library reference sends that exact image to a capable model.
  A missing reference or incapable/unconfigured provider is refused, not silently replaced
  by an unreferenced generation.
- Reference input does not guarantee that a model preserves every product detail. The
  merchant must compare the generated picture with the source before using it.
- Generated results retain the product ID from their request; later block selection must
  not relabel the result as a different product.
- Reference assets are scoped to the current workspace/store and must be ready.
- Offer text remains outside generated artwork. Existing spend limits, approval checks,
  proposal conflict checks and frozen approved email versions remain in place.
- The brand renderer still supplies unsubscribe and the final footer. Social names/links,
  address and footer text use the existing Brand settings; no settings mutation is part
  of this pass.

## Versions: what the labels mean

v8, v9 and so on are persisted content snapshots, not temporary loading attempts.
Sending a campaign does not delete its template's previous versions. The current history
query exposes the latest 100. Identical content reuses its existing version number.

View renders historical layout/copy with current store data and does not change the draft.
It is labelled accordingly; it is not proof of exactly what a historical customer received.
Restore changes the editable template, never an already frozen approved email. Sent
campaigns continue to use their separate frozen approved snapshot.

## Verification

- Four targeted tests failed on the deployed source: unsupported button styling accepted
  as a change, spacer type/border props accepted, button sizing ignored, divider styling
  ignored. They pass with the fix.
- Final unit suite: 845 passed, none skipped.
- Workspace typecheck: 19/19 tasks passed. Full production build passed using the
  repository's dummy CI settings. Web/API lint passed with no errors (warnings remain).
- Local full integration suite with sequential test files: 132 passed, 9 storage-server
  tests skipped because this run did not provision MinIO. Their separate CI job remains
  the storage gate.
- Image router recheck after final provenance change: 10 passed. A fake adapter receives
  the exact synthetic Shopify/upload bytes; real hosts are refused. No paid image call.
- One default parallel-file integration attempt exhausted four approval retries in the
  existing concurrent-approval test. The approval/retry source is unchanged by this PR.
  The same complete suite passed with test files serialised, while retaining simultaneous
  approvals within that test. Do not describe the initial failure as a Studio regression
  or quietly claim the default parallel run was green.
- Two bounded Chrome fixture rounds at 1440 px and 390 px. With two preview frames,
  the baseline short frame grew from 240 to 2460 px after the other frame reported its
  height. The fixed frame stayed at 240 px. Adding/removing an image changed the fixed
  preview from 240 to 860 and back to 240 px without refresh. No page errors or compact
  horizontal overflow in the final fixture.
- These are actual component fixtures, not a signed-in canary on the reported campaign.
  The exact production whitespace reproduction and a real generated product's fidelity
  remain to be checked after an approved deployment.

## Remaining work and live canary

This pass does not implement a persistent ChatGPT-style image conversation, per-field
proposal acceptance, saved draft sessions, or the entire campaign scrolling-page redesign.
Keep those in the redesign plan rather than calling this pass the completed Studio.

After merge/deploy approval, using a draft and no production approval action:

1. Create a picture from a specifically selected Shopify product. Confirm the source
   thumbnail/title, one prompt, no page jump, and output fidelity.
2. Choose between two same-named uploaded references by their thumbnails. Generate with
   the selected reference; check the source/result and the normal cost gate.
3. Add/remove the result, then save/reopen. Confirm the picture and canvas height update
   without a refresh and that the original Shopify photo is untouched.
4. Change button width/type size manually and through Ask Joon. Accept a real suggestion
   and inspect Inbox preview. Unsupported requests must not produce phantom changes.
5. Edit Countdown; replace a Spacer with Divider; verify preview and saved reload.
6. Add/move content and confirm the fixed footer remains last. Open Brand footer settings
   and confirm the unsubscribe remains supplied and existing social names render.
7. View an older version without draft changes; restore only if intentionally testing it.
   Check the sent campaign's frozen preview separately.

No live emails, production record changes, AWS/Bunny/Railway configuration changes or
branding changes were performed as verification for this pass.
