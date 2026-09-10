# CLAUDE.md (allo project) — drop at the allohq repo root
Project context so you never have to be re-explained. Read this fully before any task.

## What allo is
An approval-first email operator for consumer (D2C) brands. A founder types a
plain-language goal ("win back my lapsed buyers before Diwali"); allo builds segments,
writes brand-voice email, holds out a control group and measures caused revenue. Public
v1 sends email only and early access is free. Shadow invoices preview the approved
future outcome model; no billing is active. It does the job, not "a tool to do the job."
One-liner: "allo runs retention email for consumer brands - and its future performance
fee applies only when it can measure what worked."

## Non-negotiable product facts (do not contradict these in code or copy)
- PRICING during early access is FREE with SHADOW INVOICES ONLY. No Billing API calls.
  The approved future model is a capped share of non-overlapping, measurement-ready
  caused revenue, plus provider postage at cost for merchant-requested blasts. Joon
  absorbs postage for its own sends and never profits from sending. Rates and caps
  belong in the pricing module, never hardcoded in copy or feature code.
- The MOAT is the control-group causal data + the decision engine (CAM) trained on it.
  It "exists" only when control rows actually accumulate from real campaign runs. A
  passing test is not enough - a campaign run must produce DecisionRecords with a
  populated CONTROL arm. Treat that as the definition of done for any moat work.
- HOLDOUTS ARE IRREVERSIBLE: you cannot run a control group on history. Any campaign that
  runs without a holdout loses that causal data forever. Control-group capture must be
  live before any real brand's first real campaign.
- OUTCOMES screen shows lift = treatment mean - control mean (same window, matched
  cohort), and the shadow performance fee from that. Keep the "figures representative
  while control measurement is wired up" disclaimer until the numbers are REAL.

## Architecture / ownership (3 layers)
- Layer 1 (own absolutely): CAM + causal data. Classical ML (uplift/propensity/churn),
  never an LLM, never leaves allo infra. The moat.
- Layer 2 (own progressively): fine-tuned open-weight model (7-13B) for brand voice,
  served via inference provider now, self-host later.
- Layer 3 (rent forever): frontier APIs (Claude Sonnet 4.6 default) for the hard ~15%,
  behind a provider-agnostic gateway.
- One ORCHESTRATION GATEWAY routes each call by task->tier (economy model for
  high-volume generation, frontier for reasoning) with caching. This is the margin lever.
- Public v1 sends email only. Joon-hosted delivery remains the intended low-friction
  experience: Resend is the default until the flagged SES path passes acceptance.
  Merchant-requested blasts carry provider postage at cost; Joon absorbs its own sends.

## Schema discipline
- Additive migrations only. The substrate already exists (MessageLog captures
  state/action/outcome). Add fields (treatmentArm, experimentId, customerId on
  AgentAction, margin source) and tables (Experiment, Identity) - don't rebuild.
- DecisionRecord = customer state -> decision+reasoning -> treatmentArm -> action ->
  measured outcome -> margin. This is the CAM training set; capture from day one even
  before any model consumes it.

## Consequence prediction
- Every decision must surface a predicted consequence: expected upside (recovery, %lift
  vs control), NAMED downside/risk (unsub/annoyance %), and confidence. Never hide the
  downside. Until control data backs a prediction, label it an ESTIMATE, not a measured
  prediction.

## Design system
- Operator-console concept. Terminal aesthetic, dark default + emerald light variant,
  ONE token system (semantic theme tokens; accent resolves per theme).
- Monospace ONLY for command/data/IDs/code. Inter for human-readable prose/UI.
  Fraunces for headings / allo's voice lines. Never monospace-as-UI-font.
- Voice: warm, dry, human. "Drafts before sunrise. Approvals over coffee." Not robotic
  system strings, not emoji-stuffed hype ("FIRE UNMISSABLE SALE" is the anti-pattern).
- Rupees + Indian number formatting everywhere.
- Motion only where it earns it (the reasoning/console reveal). Banned on nav, reading
  content, decorative entrances. Respect prefers-reduced-motion. No stuck spinners.
- Email OUTPUT must be React Email (cross-client safe), auto-styled to each brand's
  Brand Kit, AND editable to the pixel (prompt-edit + direct manipulation), edits
  round-tripping through the React Email model so output never breaks in Outlook.

## Demo state
- ONE seeded brand: "Vana Naturals" (Indian plant-based wellness D2C). Numbers must be
  CONSISTENT across every screen (no 96-vs-93,938 contradictions). Templates/email-builder
  stay off the demo path unless explicitly being worked on.
- The 3-tap demo path: Home console (type a goal -> reasoning streams) -> approve a
  decision -> Outcomes (treatment vs control, shadow performance fee, AI cost). Keep it
  walkable at mobile width (~380px).

## Standing reminders
- Live secrets exist in this repo's history; never echo/commit them. (User rotates them
  provider-side.)
- Keep workers running or async work stalls. OpenAI key may be at quota - default Claude.
- "New shape, not new paint": when reshaping a screen, if only color/font changed it
  FAILED. The concept must drive structure.
