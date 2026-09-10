# Joon message house

Status: approved direction, implementation in progress

Date: 11 September 2026

Applies to: landing page, Shopify listing, sales conversations and founder posts

This is the source for public product language. It describes the current product and the approved future pricing model without implying that billing or SES delivery is live.

## The position

**The email tool that gets paid to send less.**

Joon decides which email is worth sending, shows the merchant the exact audience and message for approval, leaves unsafe or unnecessary recipients alone, and measures what changed against a random control.

Supporting line:

**Approval first. A reason for every send and every silence. Revenue measured against customers Joon did not email.**

## The pricing promise

Early access is free. Joon calculates shadow invoices so merchants can see what the approved model would have charged, but it does not collect payment and makes no billing API calls.

When billing is introduced:

- No measured lift, no performance fee.
- Joon keeps ₹1 of every ₹5 it can show it caused. The merchant keeps ₹4.
- The performance fee is capped at the approved published plan price for a comparable leading email platform.
- Blasts a merchant asks for carry provider postage at cost, outside the performance-fee cap.
- Joon absorbs postage for journeys and campaigns Joon proposes.
- Joon never profits from sending.
- Only non-overlapping, measurement-ready campaigns are billable in the initial model. Journeys and overlapping campaigns remain visible but non-billable until their allocation method is approved.

Do not name a comparison platform or show its price until its exact official tiers, source date and applicability have been recorded and approved by the founder.

## The three proof mechanics

### Random holdout

Joon first removes people who should not receive the email. It then assigns a small random control from the eligible audience. The emailed and held-back groups contain comparable customers, so their difference is evidence rather than ordinary last-touch attribution.

Merchant explanation:

> Joon emails most eligible customers and holds back a few at random. What the emailed group spends beyond the held-back group is what Joon caused.

### Left alone, and why

Joon shows exclusions and deferrals before the random holdout. Examples must correspond to implemented behavior:

- Recently purchased - left out when the campaign's recent-purchase rule applies.
- Fatigue cap - left out because enough email has already been sent.
- Quiet hours - deferred until the customer's next allowed local time, not dropped.
- Random control - eligible, but held back to measure the send.

Never imply that Joon deliberately puts all likely buyers into control. Rules decide eligibility first; randomization measures the decision afterward.

### Approval first

Joon prepares the audience, message, offer, schedule and control. The merchant approves the exact version. Approval freezes the campaign and its treatment/control assignment. Delivery safety is checked again before a treated email is sent.

## How to talk about the evidence

The concise form is:

> Emailed customers spent ₹4.00 each. Customers held back at random spent ₹2.40. Joon caused ₹95,200.

That example is illustrative until it is backed by a measured ledger row and must be labelled as such wherever used.

Show attributed revenue beside caused revenue when useful, but never equate them. Attributed revenue is what happened after email. Caused revenue is the estimated difference against the control. Future fees use caused revenue only.

## Objection handling

### Doesn't holding people back cost sales?

A little. Held-back customers can still buy as usual; they just miss one email. The control is how the merchant learns whether the rest of the send created new revenue or followed purchases that would have happened anyway. Joon starts with more evidence gathering for an unproven campaign family and can reduce the rate as reliable evidence accumulates.

### Why take a share of caused revenue?

Because Joon's fee should rise only when the merchant's measured result rises. The merchant keeps ₹4 of every ₹5 Joon can show it added. A conventional attributed number is not enough to create a fee.

### What happens when there is no lift?

There is no performance fee. Negative measured months carry forward rather than being ignored. During early access, every invoice remains a shadow invoice and nothing is charged.

### What about deliverability and warmup?

Joon requires a verified sending domain, consent and suppression checks. A new or newly migrated sending identity must warm gradually, starting with engaged customers and expanding only while bounce and complaint health remains safe. SES is being added behind a flag; Resend remains the default until sandbox, event, ambiguity and warmup acceptance passes. Do not promise equal inbox placement between providers.

### What happens to customer data?

Joon uses permitted Shopify data to prepare and measure approved email work. It separates consent by channel, honors suppression and deletion, and keeps merchant-facing email and forms governed by the merchant's brand. Do not claim certifications, retention guarantees or regulator approval that have not been verified.

### Does Joon send SMS or WhatsApp?

No. Public v1 sends email only. It may capture separately evidenced SMS consent for future use, but SMS, WhatsApp and RCS delivery are blocked.

## CTA system

Primary CTA: **Start free**

Secondary CTA: **See what you'd pay**

Early-access qualifier: **Free during early access. This is what you'd pay after.**

The primary CTA must always reach a working install or signup path. The secondary CTA goes to the calculator only after it is live.

## Banned claims

Do not publish:

- Guaranteed lift, revenue, conversion or inbox placement.
- Unmeasured customer results, testimonials or benchmarks.
- Any claim that SMS, WhatsApp or RCS ships in v1.
- "Never priced per email" or "never priced by volume".
- "Never more than a regular email tool".
- "No charge for emails" without distinguishing Joon's sends from merchant-requested blasts.
- A comparison price without an official source, source date, applicable inputs and founder approval.
- A claim that attributed revenue is caused revenue.
- A claim that SES provides exactly-once delivery.
- A claim that future billing is already active.

## Voice rules

- Sentence case.
- Plain words and short conclusions.
- Use " - " when a pause is necessary. Do not use em dashes.
- Lead with the merchant's decision and result, not AI terminology.
- Make restraint visible without sounding moralistic.
- Use real product mechanics. Label every illustrative figure.
- Stop once the point is made.
