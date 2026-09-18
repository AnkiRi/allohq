---
name: Joon Authenticated Application
description: A quiet, evidence-led operating system for retention work.
colors:
  paper: "#F4F2EC"
  surface: "#FFFDF8"
  surface-subtle: "#ECE9E1"
  ink: "#171717"
  muted-ink: "#666861"
  action-gold-paper: "#C38A16"
  action-gold-cobalt: "oklch(0.84 0.145 76)"
  blue-measurement: "#2D4F9E"
  blue-measurement-soft: "#E9EFFF"
  green-outcome: "#157858"
  green-outcome-soft: "#E5F4EE"
  red-failure: "#B95849"
  red-failure-soft: "#FAE8E4"
  nav: "#17204D"
  nav-ink: "#FFFDF8"
  dark-paper: "#0a0c10"
  dark-surface: "#0e1116"
  dark-ink: "#e6e8eb"
  dark-amber: "#ffb000"
typography:
  headline:
    fontFamily: "var(--font-space-grotesk), system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-inter), system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.25
  data:
    fontFamily: "var(--font-jetbrains), ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  card: "14px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "28px"
  3xl: "32px"
components:
  button-action:
    backgroundColor: "{colors.action-gold-paper}"
    textColor: "#17120a"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "9px 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.action-gold-paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "9px 14px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "9px 14px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
---

# Design System: Joon Authenticated Application

## Overview

**Creative North Star: "Scan → work → prove"**

Joon is an operating surface for consequential retention work. It should feel watchful, exact and calm: a capable team has prepared the work, exposed the evidence and left the merchant in command. The interactive reference at `.codex/visualizations/2026/07/12/019f5521-af3b-7c73-8974-bece1b177f01/joon-app-redesign.html` is the visual and interaction authority. Warm canvas, ivory work surfaces, dense ink, a navy navigation rail and decisive warm-gold actions establish the application world without competing with the task.

The system simplifies representation, never capability. Task-based navigation replaces feature taxonomy; progressive disclosure keeps explanation near the moment it matters; and pages move through a consistent anatomy of summary, workspace and receipt. The default surface is approachable operational software. Terminal language is reserved for evidence and decision receipts, where provenance and immutability are the point.

**Key Characteristics:**

- Quiet, information-dense operational surfaces with obvious next actions.
- Direct task navigation: Today, Decisions, Customers, Campaigns, Automations, Results, Activity, Inbox and Brand & content.
- Semantic color with stable meaning: warm gold/action, blue/measurement, green/healthy status and red/failure.
- Sans-serif language for operation; monospaced type only for data, measurements and receipts.
- Two deliberate themes: warm paper, cobalt and gold in light mode; near-black and amber in dark mode.

## Colors

The palette is restrained enough for long work sessions and explicit enough that color carries stable operational meaning.

### Primary

- **Action Gold on paper:** `#C38A16`, shared with the public landing page. It marks controls and merchant-attention moments on light surfaces; it is not a success color.
- **Action Gold on cobalt:** the landing page's brighter `oklch(0.84 0.145 76)`, reserved for marks, badges and progress on the navy/cobalt shell where the paper gold loses energy.

### Secondary

- **Dark Amber:** The dark-theme product accent and action color, preserving the role played by warm gold in light mode.
- **Measurement Blue:** Analytics, control comparisons, quantified evidence, focus and informational selection. Blue never implies that an action succeeded.

### Tertiary

- **Healthy Green:** Reserved for genuinely healthy status, verified positive outcomes and completed safety checks. Green is never a general product accent, navigation treatment or default primary action.
- **Failure Red:** Delivery failure, destructive action, invalid state or material risk. Do not use it for routine emphasis.

### Neutral

- **Warm Canvas:** The light application canvas and quiet field behind work.
- **Warm Paper:** Cards, popovers, inputs, the active navigation item and other contained work areas.
- **Subtle Surface:** Low-emphasis grouping, inactive controls and quiet table structure.
- **Ink:** Primary light-theme text and high-contrast structural marks.
- **Muted Ink:** Supporting labels, descriptions and timestamps.
- **Sidebar Navy:** The light-theme sidebar, creating a confident stable edge around the warm workspace.
- **Dark Paper:** The near-black dark-theme canvas.
- **Dark Surface:** Raised dark-theme work areas, separated by tone and hairline borders.
- **Dark Ink:** Primary text in dark mode.

### Named Rules

**The Stable Meaning Rule.** Warm gold asks for action, blue measures, green reports a truly healthy state or verified outcome and red reports failure. Never swap these roles to create visual variety.

**The Green Means Healthy Rule.** Green is evidence of health, successful completion or a verified positive result. Never use it as the general product accent.

**The Theme Pair Rule.** Light mode is warm canvas, warm paper, ink, navy and the landing-page gold pair; dark mode is near-black, pale ink and amber. Dark mode is a designed counterpart, not an inverted light palette.

## Typography

**Display Font:** Space Grotesk (with system-ui fallback)  
**Body Font:** Inter (with system-ui fallback)  
**Label/Mono Font:** JetBrains Mono (with ui-monospace fallback)

**Character:** Space Grotesk gives headings compact confidence, while Inter keeps dense operating text neutral and highly legible. JetBrains Mono makes values, comparisons and durable records scannable without turning the whole product into a terminal.

### Hierarchy

- **Headline** (600, responsive by surface, 1.2): Page and section orientation. Keep headings short, sentence case and balanced.
- **Title** (600, 15–18px, 1.25): Cards, panels and primary objects inside the workspace.
- **Body** (400, 14px, 1.5): Explanations, task content and supporting prose. Prefer short paragraphs and progressive disclosure over wide blocks.
- **Label** (600, 10–12px, 1.25): Navigation groups, statuses, controls and compact metadata. Uppercase is limited to brief structural group labels with measured tracking.
- **Data** (500, 12px, 1.45): Currency, percentages, identifiers, timestamps, commands, comparisons and receipt evidence. Use tabular numerals for columns and changing values.

### Named Rules

**The Operation Before Instrumentation Rule.** Use sans-serif type for navigation, instructions, actions and prose. Use mono only when the content is data, measurement, an identifier or a decision receipt.

**The Sentence Case Rule.** Founder-facing titles and controls use sentence case. Uppercase is a compact structural annotation, never the default voice.

## Layout

The authenticated shell is a fixed-height control room: persistent navigation at the left, a compact contextual top bar and one independently scrolling workspace. Expanded navigation is 204px wide and may collapse to 68px; the top bar is 62px on desktop and 60px on compact screens. The content column is centered and capped at 1280px, with workspace padding that grows from 16px on narrow screens to 32px on desktop.

Navigation reflects merchant tasks rather than the internal product model. Setup status and Settings remain utilities; Store & integrations remains reachable through Settings. Ask Joon is a compact control layer, not the system of record. Store identity remains visible in the top bar so the operator always knows which merchant context is active. On mobile, navigation becomes an off-canvas drawer with a dismissible scrim.

Pages follow a summary / workspace / receipt anatomy. The summary answers what changed and what needs attention. The workspace contains the active task and reveals complexity in context. The receipt records what was decided, approved, sent, suppressed or measured. Not every page needs three visible panels, but its information should map cleanly to those responsibilities.

Spacing uses a 4px base with an 8–32px operational range. Prefer fewer, stronger groups over nested cards. Tables and repeated rows remain compact; decision moments receive more breathing room. At approximately 390px, the primary task, state, action and essential evidence remain available without horizontal scrolling.

## Elevation & Depth

Joon is flat by default. Paper, tonal surfaces, hairline borders and spacing establish hierarchy; shadows provide quiet separation for contained or transient surfaces, not decoration. Cards use a small ambient shadow in light mode and denser black separation in dark mode. Hover may strengthen the border or shadow, but cards do not float upward.

### Shadow Vocabulary

- **Ambient card** (`0 1px 2px rgba(23, 23, 20, 0.04), 0 18px 40px -30px rgba(23, 23, 20, 0.32)`): Resting light-theme cards and contained work surfaces.
- **Ambient card hover** (`0 1px 2px rgba(23, 23, 20, 0.06), 0 22px 48px -30px rgba(23, 23, 20, 0.38)`): Interactive light-theme cards, paired with a stronger border and no translation.
- **Dark card** (`0 1px 2px rgba(0, 0, 0, 0.35), 0 12px 32px -24px rgba(0, 0, 0, 0.9)`): Dark-theme surface separation.

### Named Rules

**The Structure Carries Depth Rule.** Start with tone, spacing and border. Add shadow only when a surface must separate from its immediate context.

**The No Hover Lift Rule.** Operational cards remain spatially stable. Hover changes border or tone, not geometry.

## Shapes

Corners are gently rounded and practical. Controls use 6–8px radii, standard panels use 12px, and primary cards use 14px. Pills are reserved for compact statuses, counts and short-lived context. Hairline borders remain low contrast until hover, focus or error gives them a reason to strengthen.

Circular marks are used for identity, presence and compact status only. Avoid decorative blobs, excessive capsules or a different radius for every component.

## Components

Components should feel compact, certain and native to sustained work. State changes are immediate, with 100–200ms transitions; motion disappears under `prefers-reduced-motion`.

### Buttons

- **Shape:** Compact rounded rectangle (8px) with a 36px default height.
- **Action:** Amber fill with dark ink for approval, intervention and decisions requiring the merchant.
- **Primary:** Warm gold with dark ink in light mode and amber with near-black ink in dark mode for the leading action.
- **Secondary:** Surface fill, hairline border and ink text. Ghost actions remove the fill but retain a clear hover field.
- **Hover / Focus:** Strengthen color or border without changing layout. Focus uses a 2px semantic outline with 2px offset. Active press scales briefly to 97%; disabled controls remove press feedback and meet readable contrast.

### Chips

- **Style:** Compact pills with semantic soft backgrounds and matching text. Use them for status, filters, counts and evidence strength, not as a substitute for buttons.
- **State:** Selected filters require more than color: a check, border, label or persistent position must confirm selection.

### Cards / Containers

- **Corner Style:** Gently rounded (14px).
- **Background:** White on paper in light mode; dark surface on dark paper.
- **Shadow Strategy:** Ambient and quiet, following the flat-by-default depth rules.
- **Border:** One low-contrast hairline, strengthened for hover, focus or selection.
- **Internal Padding:** Usually 16–20px; dense rows may use 12px.

### Inputs / Fields

- **Style:** Surface background, 8px corners, 36px minimum height and a visible hairline border.
- **Focus:** A clear semantic focus outline plus an accent caret; focus never depends on a subtle color shift alone.
- **Error / Disabled:** Red belongs to the specific invalid condition. Disabled state remains legible and explains why when the reason is not obvious.

### Navigation

The sidebar is a 204px navy rail with 14px task labels and 16px line icons. It presents the direct task IA without category headings. Active items use a warm-paper field with dark ink and set `aria-current="page"`; cobalt gold remains available for action badges rather than active navigation. Setup status, Settings and Ask Joon are utilities; Store & integrations is reached through Data & store or Settings. The compact top bar names the current task and keeps the active store identity visible; global search and workspace health remain secondary.

### Decision and evidence receipts

Receipts are the only place terminal styling may become a dominant motif. Use mono for immutable values, identifiers, audience counts, control assignments, checksums and timestamps; use rules and compact rows to show provenance. Keep the surrounding explanation and actions in sans-serif so the receipt reads as evidence inside a product, not a command-line simulation.

## Do's and Don'ts

### Do:

- **Do** preserve every feature and route while simplifying how work is grouped and revealed.
- **Do** organize pages around summary, workspace and receipt responsibilities.
- **Do** make approval, suppression, holdouts, evidence strength and silence visually legible.
- **Do** keep semantic color meanings stable in both themes and reinforce them with text or iconography.
- **Do** keep the primary task, state, action and essential evidence usable at approximately 390px wide.
- **Do** respect reduced motion and maintain WCAG 2.2 AA contrast and keyboard focus.

### Don't:

- **Don't** expose the internal feature taxonomy when a merchant task is the clearer label.
- **Don't** use warm gold as generic decoration, blue as success, green as a general accent or pending action, or red as routine emphasis.
- **Don't** spread terminal styling or monospaced prose across ordinary navigation, forms, cards or explanations.
- **Don't** hide consequential scope, audience, suppression, schedule or measurement details behind decorative minimalism.
- **Don't** add gradients, glass effects, glow or ornamental motion to compensate for weak hierarchy.
- **Don't** let merchant-facing emails, storefront forms or brand assets inherit the Joon application theme.
