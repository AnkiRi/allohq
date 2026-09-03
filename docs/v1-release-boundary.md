# Joon v1 release boundary

Status: adopted 2026-09-02

## Product contract

Joon v1 is a free Shopify app for email campaigns and merchant-approved email
automations and journeys:

1. Shopify-origin install and store sync.
2. Natural-language request becomes a structured draft.
3. Merchant previews the frozen audience, message, sender, offer, and holdout.
4. A real Shopify discount is created when requested.
5. Explicit human approval is required for the exact approved payload.
6. A randomized holdout is enabled by default.
7. Treatment and control outcomes are reported without unsupported causal claims.

The v1 server must fail closed for every capability outside this contract.
Hiding navigation is not sufficient.

## Explicitly outside v1

- Autopilot or autonomous campaign execution.
- Unapproved automations, legacy adaptive-channel journeys, proactive outreach,
  and scheduled campaign generation.
- SMS, WhatsApp, and RCS creation or delivery.
- Cross-brand intelligence exposed to merchants.
- Individual-outcome prediction claims.
- Performance billing or any per-message fee.
- Unapproved background merchant emails.

## Distribution

The target is a free, fully visible Shopify App Store listing so Shopify discovery
can source design partners. Capacity is controlled inside the app:

`install -> connect -> onboarding capacity gate -> hands-on activation`

The first cohort is 3-5 active brands. Additional installs join an honest
waitlist with their position or expected onboarding slot. The product must still
provide a coherent, reviewable experience to every installer.

Expansion gate:

- 30 consecutive days of clean live operation.
- At least 20 successful approved campaigns.
- Zero duplicate sends.
- Zero sends against a changed or missing approval.
- Zero sends outside the v1 channel and workflow boundary.

## Economic principle

Joon does not compete on delivery price and must never charge per email. Charging
per send would reward volume and conflict with the product's central promise to
measure restraint and incremental lift.

V1 is free. If Joon later charges, the intended axis is verified decision value,
not message volume. No performance-fee claim ships until attribution is proven.

Current implementation note: delivery uses provider credentials configured by
Joon at deployment time (currently Resend). Merchant-owned ESP routing and a
Judge.me Email adapter are future options; they do not exist today.

## Required release control

`V1_RELEASE_MODE=true` must enforce the boundary server-side:

- Register only workers required for Shopify sync, privacy webhooks, approved
  email campaign/automation delivery, delivery events, and outcome attribution.
- Reject non-email dispatch at the final provider chokepoint.
- Reject unapproved automation, legacy adaptive-channel journey, proactive,
  scheduled-generation, and autopilot execution.
- Require an approval checksum covering content, frozen audience, sender, offer,
  schedule, and holdout configuration.
- Invalidate approval after any covered field changes.
- Default all delivery to disabled or an explicit test allowlist.
- Enforce global and per-store kill switches, new-store caps, and complaint pause.

Tests must prove excluded paths cannot send; absence from the UI is not proof.

## Work order

1. P0-zero: land existing launch-critical work in reviewable commits.
2. P0A: implement `V1_RELEASE_MODE` and excluded-path tests.
3. P0B: finish visitor tokens, encryption-key configuration, retention jobs, and
   provider-side credential rotation.
4. P0C: canonical audience resolution, approval checksum, kill switches,
   complaint pause, and dry-run report.
5. P0D: embedded App Bridge, Shopify session tokens, Shopify-origin install,
   deployed app configuration, protected-customer-data request, legal/support
   materials, and App Store submission.
