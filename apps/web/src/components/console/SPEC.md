# Console Kit — operator console spec

The terminal "operator-console" concept from the landing (`src/app/page.tsx` +
`landing.css`) propagated into the app as **structure, not paint**. Where the old
app showed a dashboard of KPI cards, the operator drives a console: a command
line, a live reasoning stream, a status line, and decisions to approve/pass.

This kit is the shared vocabulary. Sibling screens (customers, segments,
automations, analytics) should reuse it so every surface reads as the same
console.

## The concept

- **One command line.** The operator types a goal in allo's voice; allo reasons
  out loud and queues decisions.
- **allo thinks in the open.** Reasoning is terminal output — what it scanned,
  what it held back, what it drafted — not a spinner.
- **Decisions, not charts.** Pending work is a `DecisionCard` you approve or pass
  inline, in operator language.
- **Calm.** Motion lives only on the reasoning stream and the caret. Reading and
  navigation never move.

## Components (one per file)

Import from `@/components/console`.

### `ConsoleFrame`
A pane with a top status bar (3 lamps, mono title, live clock) and a `bg-card`
body. Wraps console surfaces.
- `title?: string` — mono bar title (default `"allo — operator"`)
- `live?: boolean` — third lamp pulses (default `true`)
- `clock?: boolean` — show live clock (default `true`)
- Clock renders a stable `--:--:--` on the server and ticks client-side only
  (no hydration mismatch).

### `CommandLine`
The `allo ›` prompt + input.
- `placeholder?: string | string[]` — a single string, or a list that rotates
  while the field is empty
- `onSubmit(value: string)` — fired on Enter with the trimmed value; input clears
- `rotateMs?: number` (default `3800`), `autoFocus?: boolean`
- Mono input, accent caret, focus → accent border, blinking caret on the
  rotating placeholder. Caret animation disabled under reduced motion.

### `StreamOutput` + `StreamRow`
Terminal output lines. `StreamOutput` staggers its rows in on mount.
- `StreamOutput`: `stagger?: number` seconds (default `0.065`), `aria-label?`
- `StreamRow`: `tick?: "ok" | "step" | "hold"` (✓ / ▸ / ◦), children (wrap
  emphasis in `<b>` → rendered foreground-bold)
- Easing `cubic-bezier(0.16, 1, 0.3, 1)`. Under `useReducedMotion()` rows skip
  variants entirely and render visible. **Content is in the DOM regardless of JS
  — motion only animates what is already there.**

### `DecisionCard`
allo's decision in operator language.
- `decision: ReactNode` — one sans line, warm voice
- `reasoning?: { tick?; text }[]` — short mono stream (found / held back / drafted)
- `tags?: OpTagKind[]`
- `impact?: number | null` — estimated ₹ impact, en-IN, prefixed `~`; hidden if `<= 0`
- `onApprove?()`, `onPass?()`, `busy?: boolean` — inline mono buttons

### `OpTag`
Bracketed mono chip, accent-bordered, lowercase: `[memory]`.

### `MetricReadout`
Mono tabular `label value` readout.
- `value: string | number`, `money?: boolean` (₹ en-IN), `accentSuffix?`,
  `live?` (pulsing accent dot)
- Exports `formatINR(n)` helper.

## Tag taxonomy (`OpTagKind`)

| tag          | meaning                                            |
| ------------ | -------------------------------------------------- |
| `memory`     | respected what it knows about a customer           |
| `pre-empt`   | acted ahead of a problem (e.g. late shipment)      |
| `timing`     | sent on the customer's clock                       |
| `win-back`   | re-engaging lapsed buyers                          |
| `welcome`    | onboarding / first-touch                           |
| `fatigue`    | held back to avoid over-messaging                  |
| `vip`        | rewarding champions / high-value customers         |

Map an autonomy action → tag from its `category`/`type` (win-back, welcome,
fatigue holds, VIP rewards, pre-emptive apologies, send-time optimization).

## Data → console mapping (Home)

Same tRPC queries as before; only the presentation changed.

- **Command line** → `useAlloAI()` (`setInput` + `focusInput` + `openPanel`)
  prefills and submits the existing AI panel goal flow (same path Cmd+K uses).
- **Reasoning stream** → `dashboard.stats`, `segments.distribution`,
  `automations.list`, `autonomy.listActions`, `dashboard.tokenUsage`: scanned N ·
  cohort · held back M (fatigue) · drafted X · ready.
- **Status line** → `MetricReadout`s: live · `stats.totalCustomers` ·
  `analytics.roi` / `dashboard.revenueAttribution` revenue/30d (₹) ·
  `dashboard.tokenUsage.totalCost` AI cost ($, USD).
- **Pending decisions** → `autonomy.listActions` (status `pending`) →
  `DecisionCard`. Approve = `autonomy.approveAction.mutate({ actionId })`,
  Pass = `autonomy.rejectAction.mutate({ actionId, reason })`. Invalidate
  `autonomy.listActions` on success.
- **Gating preserved**: no store → `ConnectStorePrompt`; onboarding incomplete →
  `OnboardingWizard`. Both now sit on the terminal surface.

## Theme / motion / voice rules

- **Tokens only.** `bg-background` / `bg-card` / `text-foreground` /
  `text-muted-foreground` / `border-border`; accent via
  `text-[hsl(var(--accent))]` (emerald in light, amber in dark). No hardcoded
  cream/old hexes.
- **Fonts.** `font-mono` (JetBrains) for command / operator / data only;
  `font-sans` (Inter) for prose; `font-serif` (Space Grotesk) for headings.
- **Money.** ₹ + `en-IN` everywhere; AI cost stays `$` (USD).
- **Motion.** Only the reasoning stream + caret animate. Reduced-motion fallback
  shows everything static. Never gate content on JS.
- **Voice.** allo is warm and plain. "held back 12 — they'd heard from us this
  week", not "suppressed 12 (frequency cap)".
