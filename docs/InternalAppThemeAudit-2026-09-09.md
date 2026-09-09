# Internal application theme audit - 9 September 2026

## Derived scope

- 43 authenticated route pages under `apps/web/src/app/(dashboard)/**/page.tsx`.
- 54 shared component files under `apps/web/src/components/`.
- Merchant output excluded by design: `packages/emails`, branded-email rendering, the storefront widget, hosted customer forms, confirmation pages and email preview documents.

## Starting state

- Three application themes existed: Light, Drenched and a generic near-black Dark theme.
- Light used emerald as a generic action colour, so decisions and verified outcomes were visually conflated.
- Drenched rendered working cards on cobalt, reducing table and editor readability.
- 126 hardcoded colour matches and 22 `dark:` utility matches bypassed the theme contract in the audited application surface.
- Onboarding and the activity panel carried a separate cream/green styling vocabulary.
- Theme persistence already used a key separate from the public landing, which is the correct boundary.
- Focus, selection, control, evidence and outcome roles were not expressed as durable semantic tokens.

## Accessibility and state risks found

- Muted text and legacy dark overrides could produce low contrast when a light working surface appeared inside Drenched.
- Generic green represented primary actions, success, revenue and status simultaneously.
- Several states relied on colour alone even when their text labels were otherwise adequate.
- Hardcoded white panels inherited surrounding foreground colours inconsistently.
- The third Dark theme increased the state matrix while adding no product-specific visual meaning.

## Consolidation direction

1. Light is the SSR-safe default: warm off-white ground, paper surfaces and semantic gold/cobalt/emerald.
2. Drenched is the optional dark environment: cobalt shell with warm-paper operational surfaces.
3. Gold means decision or approval; cobalt means measurement, restraint or evidence; emerald means a verified outcome.
4. Warning and destructive colours remain independent of the three product accents.
5. Shared tokens and primitives replace route-specific palette overrides.
6. Existing preferences migrate as follows: `spectrum -> light`, `drenched-paper -> drenched`, `dark -> drenched`, invalid/mono -> light.

## Route inventory

| Surface group | Routes | Primary states audited |
| --- | ---: | --- |
| Shell and home | 5 | navigation, command search, dashboard, activity, actions |
| Campaigns and outcomes | 7 | list, draft, approval, treatment/control, reporting |
| Automations and journeys | 5 | list, detail, editor, experiment, inactive state |
| Forms and acquisition | 3 | list, creation, analytics, disabled and empty states |
| Customers, segments and commerce | 9 | tables, detail, filters, products and orders |
| Intelligence and brand | 4 | evidence, cohorts, brand controls and model labels |
| Integrations and readiness | 6 | Shopify state, DNS/readiness, guardrails and settings |
| Templates and creative tools | 4 | library, editor, previews and channel boundary |

## Shared primitives to consolidate

- Theme provider and pre-paint resolver.
- Application shell, workspace, sidebar and top bar.
- Card/paper, popover, input and table surfaces.
- Decision, measurement, outcome, warning and destructive tokens.
- Buttons, badges, progress, focus, selection and disabled states.
- Loading, error, empty, toast, dialog and command-palette surfaces.

## Verification contract

- Light and Drenched at 1440, 1024, 768 and 390 widths.
- Signed-out shell plus reachable empty, loading, populated, disabled and error examples.
- WCAG AA for body copy, controls and small mono labels.
- Keyboard focus and non-colour state labels.
- No theme leakage into merchant emails, brand rendering or storefront widgets.
