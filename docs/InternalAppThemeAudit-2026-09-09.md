# Internal application theme audit - 9 September 2026

## Scope derived from the repository

- 43 route pages under `apps/web/src/app/(dashboard)/**/page.tsx`.
- 51 shared `.tsx` and `.css` component files under `apps/web/src/components`.
- Merchant output is deliberately excluded: `packages/emails`, branded-email rendering, the storefront widget, hosted customer forms and email preview documents. Their colours belong to each merchant, not to the Joon dashboard.
- `/options/v3-landing` has its own two-palette contract. `/` and `/options/v2` retain the legacy three-palette implementation until the new landing is approved.

## Starting risks

- Light used emerald as a generic action colour, conflating an action with a verified outcome.
- Drenched rendered dense work directly on cobalt and inherited dark ink inconsistently.
- Route-local colour utilities and legacy `dark:` overrides bypassed the theme contract.
- Generic green represented primary actions, success, revenue and status at the same time.
- A generic near-black Dark theme added a third state matrix without adding product meaning.

## Implemented contract

- **Light** is the SSR-safe default: warm off-white application ground, white paper, near-black ink, gold decisions, cobalt evidence and emerald verified outcomes.
- **Drenched** is optional: a cobalt application environment with warm-paper operational surfaces. It is not a generic dark mode.
- Stale preferences migrate deterministically: `spectrum -> light`, `drenched-paper -> drenched`, `dark -> drenched`, and `mono` or unknown values to Light.
- The landing preference and authenticated-app preference use separate storage keys.
- Semantic tokens cover background, paper, subtle/elevated surfaces, ink levels, borders, focus, decision, measurement, outcome, warning, destructive, informational, disabled and chart states.
- Warm-paper components rebind foreground, muted, border, input and secondary tokens locally, while the surrounding Drenched shell keeps light ink.
- All interactive state still has text, shape or icon cues; colour is not the only signal.

## Route-by-route browser audit

Every route below was requested locally in both Light and Drenched at 1440px. No route produced page-level horizontal overflow. Dynamic routes used a deliberately missing id to inspect their loading/error boundary; populated-record acceptance remains a real-data test. `/admin/llm` and `/demo/welcome` returned route shells but no inspectable content without their required authorization or data, so 41 of 43 routes had rendered content in both themes.

| Routes | Light | Drenched | State observed |
| --- | --- | --- | --- |
| `/dashboard`, `/activity`, `/actions`, `/agent` | Pass | Pass | shell, empty/connection states |
| `/analytics`, `/outcomes` | Pass | Pass | reporting and underpowered/empty states |
| `/campaigns`, `/campaigns/new`, `/campaigns/[id]` | Pass | Pass | list, creation, missing-record boundary |
| `/automations`, `/automations/[id]`, `/automations/[id]/edit`, `/automations/[id]/ab-test` | Pass | Pass | list plus missing-record/loading boundaries |
| `/forms`, `/forms/new`, `/forms/[id]` | Pass | Pass | list, full form builder, missing-record boundary |
| `/customers`, `/customers/[id]` | Pass | Pass | list/empty and missing-record boundary |
| `/segments`, `/segments/new`, `/segments/[id]` | Pass | Pass | list, rule builder, missing-record boundary |
| `/products`, `/orders` | Pass | Pass | commerce tables and connection/empty states |
| `/intelligence`, `/intelligence/brand`, `/intelligence/cohorts` | Pass | Pass | evidence, brand controls and cohorts |
| `/onboarding`, `/onboarding/brand-review` | Pass | Pass | guided flow and connection boundary |
| `/integrations`, `/integrations/shopify` | Pass | Pass | provider cards and Shopify detail |
| `/settings`, `/settings/autonomy`, `/settings/guardrails`, `/settings/readiness` | Pass | Pass | appearance, model, guardrail and readiness states |
| `/templates`, `/templates/new`, `/templates/[id]/edit`, `/templates/channel` | Pass | Pass | library, full editor, missing-record boundary and channel redirect |
| `/creative-studio`, `/emails`, `/conversations` | Pass | Pass | editors, email workspace and conversation states |
| `/admin/llm`, `/demo/welcome` | Not inspectable | Not inspectable | route shell only without required authorization/data |

## Responsive verification

The six highest-density representatives - `/dashboard`, `/campaigns/new`, `/forms/new`, `/creative-studio`, `/templates/new` and `/settings` - were measured at 1440, 1024, 768 and 390px. All 24 combinations kept `scrollWidth === clientWidth`. The 390px form builder was also visually inspected after its connection state resolved; fields stack without clipping and the mobile shell replaces the desktop sidebar.

## Accessibility verification

- Browser keyboard traversal reaches a visible 2px cobalt focus outline; theme controls are real pressed-state buttons.
- Warm-paper muted ink is `rgb(88,82,75)` on `rgb(255,250,240)`, a 7.41:1 contrast ratio.
- Breadcrumbs, sidebar navigation, keyboard hints, profile metadata, assistant prompts and route-specific empty-state guidance use fully opaque semantic ink. A composited browser sweep found the original 19 AA failures plus two route-specific strings; the shared-token and component fixes remove opacity from meaningful small text rather than compensating route by route.
- Clerk authentication surfaces use an explicit warm-paper appearance with dark primary and secondary ink, so hosted sign-in content does not inherit a low-contrast light widget treatment on the Drenched shell.
- Drenched paper surfaces use dark ink; browser-computed examples were `rgb(23,20,18)` on `rgb(255,250,240)`.
- Warning and destructive states do not borrow the product accents.
- `prefers-reduced-motion` rules remain in the landing, console and streamed-output implementations; content is not gated behind motion.
- Disabled states retain labels and reduced opacity rather than disappearing.

## Hardcoded-colour classification after migration

The remaining literal colours are intentional output boundaries rather than dashboard-theme leaks:

- `AppearanceSetting`: tiny palette preview swatches.
- `ColorField`, onboarding and brand settings: merchant-controlled brand colour values.
- Forms and template editors: initial merchant-facing form/email colours.
- `EmailPreviewFrame` and Creative Studio dark-mode literals: the merchant email/device preview canvas, not application chrome.
- Settings `#96BF48`: Shopify's provider mark.

Dashboard warnings, errors, decisions, controls, estimates and outcomes now use semantic tokens. `packages/emails`, widget code and brand-kit rendering were not touched.

## Shared primitives consolidated

- `ThemeProvider` and the pre-paint resolver normalize and persist application themes without activating the legacy `.dark` class.
- Application shell, sidebar, top bar, cards, popovers, inputs, tables and assistant panels share semantic surfaces.
- Buttons, badges, progress, focus, selection, loading, empty, warning and destructive states use the same roles.
- Campaign treatment/approval is decision gold; holdout/evidence is measurement cobalt; completed and verified revenue/lift is outcome emerald.

## Landing isolation verification

- `/options/v3-landing` defaults to Drenched and exposes exactly Drenched and Light.
- `?pal=light` resolves to Light; `?pal=drenched` resolves to Drenched.
- `drenched-paper`, `spectrum`, `mono`, `dark` and unknown query values fall back to Drenched without an error.
- All required Drenched data surfaces resolve to warm paper: morning brief, receipt marquee, journey nodes, holdout/readout, customer ledger, sharper-decision cards and pricing bill.
- The HELD OUT area remains a deliberate cobalt inset with off-white text.
- A clean-tab Drenched -> Light -> Drenched switch produced no console or hydration error.
- `/options/v2` and `/` still expose Dawn, Day and Night and remain isolated from the v3 names.

The legacy all-cobalt Drenched rules remain intentionally as the shared base used by `/` and `/options/v2`. The v3 warm-paper treatment is scoped with `.v3-landing[data-pal="drenched"]` selectors. Removing the shared base literally would have changed the live landing, so this is a deliberate isolation safeguard rather than unfinished palette cleanup.

## Reproducible verification counts

- `pnpm test` is authoritative: its runner reports 52 selected test-file paths and 152 passing tests. Independent filesystem counts may differ when they use different globs; the runner's own discovery output is the reproducible baseline.
- `pnpm -r typecheck` evaluates the monorepo scope, while 18 workspaces currently define and execute a `typecheck` script. The reliable result is zero TypeScript errors across those 18 scripts, not “30 typecheck workspaces.”
- The production web build completed successfully. Build progress reported 56 generated pages; that number is not presented as the count of audited application routes. The route audit is derived separately from the 43 dashboard `page.tsx` files listed above.

## Honest remaining acceptance boundary

Repository implementation is complete after the documented shared-chrome AA corrections. Local browser coverage is complete for the 41 routes with inspectable empty, loading or error content. Populated dynamic records, the two authorization/data-dependent blank routes, production API failures, real long merchant data, Shopify handoff first paint and real-account persistence require the production acceptance pass; they are not reproducible truthfully from the empty local store state and mismatched local Clerk credentials.
