# Wednesday demo runbook — allo (growth-intelligence thesis)

**URL:** https://agent.allohq.ai (incognito → `/try/<token>`) · **Brand:** Vana Naturals (seeded demo) · **Width:** works at ~390px (phone-safe)

> **Open with the thesis:** *"Everyone else grows by sending MORE. allo grows by sending LESS —
> it learns who to message, when, on which channel, and crucially **who to skip**, so you make more
> revenue from fewer sends and stop burning your list. The way it knows is a held-out control on
> every send — the invisible training engine underneath."*

**Two things allo does:** (1) **Automation** — runs the retention motion overnight (segments, writes,
schedules, queues for your okay). (2) **Growth intelligence** — the causally-trained decision layer
that concentrates sends where they cause lift and holds back where they don't.

---

## TUESDAY dry-run (do the full thing once, on prod, on your phone) — DEADLINE: this afternoon
Tick every box. If any fails, message me. **If the redesign isn't clean by this afternoon → we FALL
BACK to the current Outcomes screen and you narrate the growth thesis verbally (see fallback below).**

- [ ] **Prod reseeded** with the new 3-segment data (see "reseed" below) AND the new UI deployed — they must ship together.
- [ ] **Login / demo** works (incognito → `/try/<token>`).
- [ ] **Home console** loads; typing a goal streams reasoning in the chat panel (no stuck spinner).
- [ ] **Outcomes → "allo · growth intelligence"** panel is at the TOP and reads:
  - "Do more by sending less."
  - proven incremental ₹ · **% of sends allo would skip (~28%)** · held-to-measure cohort
  - concentrated-lift table: **Lapsed Champions ▸ send**, **At Risk ▸ send**, **Champions ⏸ hold back** (~₹0 lift)
- [ ] **Champions row shows HOLD BACK** with a ~₹0 lift — this is the money moment ("they'd buy anyway").
- [ ] Below the panel, the **control comparison** still renders (the causal proof).
- [ ] **Campaigns → Champions VIP Reward → "How allo decided"** → the growth call reads **"Hold this segment back next time."**
- [ ] **Campaigns → Diwali Win-Back → "How allo decided"** → growth call reads **"Keep sending this segment."**
- [ ] Numbers **reconcile** across the panel, the table, and the campaign traces.
- [ ] Repeat the whole path **on your phone** — nothing overflows at 390px (the table stacks).

**Reseed (prod, your established flow):** set `DATABASE_URL` to the public Postgres URL, run
`pnpm --filter @allohq/database exec tsx prisma/seed-vana-campaigns.ts`, unset it. (Never paste the
URL in chat; use the public `*.proxy.rlwy.net` host, not `postgres.railway.internal`.) The seed
prints one line per campaign — sanity-check: Diwali & At-Risk positive lift, Champions ≈ ₹0.

---

## THE WALK (Wednesday, ~6–8 min)

**1. The goal — Home console**
Type: *"win back my lapsed customers before Diwali."* Watch the reasoning stream in the chat panel.
Say: *"I describe the outcome; allo builds the segment, writes the brand-voice email, plans the send —
and holds a control back automatically."*

**2. The money slide — Outcomes → growth intelligence (LEAD HERE)**
Say: *"This is the whole thesis. allo ran three segments. Two — lapsed and at-risk — the control PROVED
respond: it keeps sending them. The third, my loyal Champions, the control showed would've bought
**anyway** — near-zero incremental lift — so allo **holds them back**. Same revenue, ~28% fewer sends,
a list that stays worth opening. Growth by sending less."*

**3. The proof underneath — control comparison**
Say: *"And it's not a guess. Right below: the held-out control vs treatment. That gap is real and it's
what allo bills on — a base fee plus a cut of **proven** lift, nothing else."*

**4. "How allo decided" — the moat, made legible** (open on Champions VIP Reward)
Say: *"allo shows its work. Here it literally says **hold this segment back** — they bought anyway, the
email didn't cause it. That call comes from a control group no blast-tool ever collects — and you can't
create one on history. That's the moat: a decision engine trained on causal data, and it compounds
every cycle."*

**5. Honesty as credibility**
Say: *"When a segment's too thin to be sure, it says so instead of quoting a number. Everything here is
computed live from the measured lift — nothing hardcoded."*

**Close:** *"Automation runs the motion. Growth intelligence makes it send less and earn more — and it
gets sharper every cycle, because every holdout teaches it who to send and who to skip."*

---

## THE NUMBERS (per-customer lift is population-independent; ₹ totals scale with Vana's count)
- **Diwali Win-Back** (Lapsed Champions): lift ≈ **+₹88/cust**, significant → **SEND**.
- **At-Risk Reactivation** (At Risk): lift ≈ **+₹67/cust**, significant → **SEND**.
- **Champions VIP Reward** (Champions / loyal): lift ≈ **+₹5/cust**, NOT significant → **HOLD BACK**.
- **Sends allo would skip ≈ 28%** (the Champions treated volume). Fee = **base ₹24,000/mo + 15% of
  PROVEN incremental margin** (only the two significant segments count). Read exact ₹ off the screen.

## HONESTY LINE (say it early)
*"This is our seeded demo brand — the pipeline is real and live; the numbers are illustrative until our
first pilot's real control data lands. The send/hold decisions you see are computed from the measured
lift, not scripted."*

## STAY ON PATH — don't click into
Templates / email-builder deep edit, empty admin screens, store-connect flows. "Built, not on today's path."

## FALLBACK (if the redesign isn't prod-verified by Tuesday afternoon)
Do **not** reseed prod / deploy the new UI. Keep the **current** Outcomes screen (control comparison +
₹-lift + fee) and narrate the growth thesis verbally over it: *"the control lets allo learn who to skip
— growth by sending less."* The story survives without the new screen; an unverified redesign on stage
does not.

## IF A SCREEN LOOKS OFF (recovery)
- **Growth panel missing / empty** → `camImpact` found no data; the reseed didn't take → re-run the seed, refresh.
- **Champions shows "send" or "learning" instead of "hold back"** → seed effect sizes drifted or the
  control arm < 30; re-run the seed; if still off, fall back and skip the Champions beat.
- **A number disagrees between screens** → note both, don't improvise; move on, reconcile after.
- **Anything stuck/spinning** → refresh once; if it persists, stay on the growth panel + a decision trace (the moat is the point).
