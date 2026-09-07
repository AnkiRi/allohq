# Signup forms and audience growth

Audited and hardened on 6 September 2026.

## Why this is launch-critical

Joon cannot be a credible email platform if it only markets to customers Shopify already knows. A storefront acquisition layer turns anonymous traffic into an explicitly consented audience and gives the welcome journey its starting event. Omnisend's 2026 guide treats the first signup form and welcome email as foundational setup, and distinguishes behavioral popups, embedded forms and gamified forms. Attentive likewise treats branded signup units, a clear offer, explicit terms and a welcome flow as one continuous system.

References:

- https://www.omnisend.com/blog/email-marketing/
- https://www.attentive.com/blog/sms-and-email-marketing-guide
- https://www.attentive.com/blog/email-and-sms-orchestration-guide
- https://www.attentive.com/blog/email-and-sms-marketing

## What is real now

- Merchant form builder with email, first name and checkbox fields.
- Required explicit email-consent field for every form that can become active.
- Modal, left/right flyout and announcement-bar placements.
- Exit-intent, time delay, scroll depth and page-load triggers; mobile exit intent uses a delayed fallback.
- Seven-day dismissal frequency by default.
- Brand colors and typography applied to storefront forms.
- Percentage/fixed-value Shopify discount incentive with the merchant discount guardrail enforced.
- Exact popup-to-form resolution: a forged or stale popup ID cannot fall through to another form.
- Submitted payloads are allowlisted against configured fields; phone and arbitrary fields are discarded in email v1.
- Email consent is written to the durable channel consent record. A fresh explicit opt-in can reverse an unsubscribe; complaints and hard bounces remain suppressed.
- A successful signup triggers an activated welcome journey with a submission-id idempotency key.
- Welcome journeys and incentives fire on a new email opt-in, not on every repeat submission.
- Popup views and submissions enter the event ledger without duplicating the email address.
- Shopify theme app extension loads the widget from Shopify's CDN; no theme-code paste is required.
- Readiness reports active forms, active popups and whether the app embed has been observed live.

## Formats and honest boundaries

| Format | State | Notes |
|---|---|---|
| Center modal | Ready | Best for a focused offer |
| Bottom flyout | Ready | Less disruptive and useful during browsing |
| Announcement bar | Ready | Compact capture surface at the top of the page |
| Embedded section/footer form | Ready in code | Shopify app block renders any active form by ID; live theme acceptance remains |
| Multi-step form | Ready in code | Up to five steps with per-step validation and keyboard focus progression |
| Spin-to-win | Pending by design | Requires server-selected weighted prizes, odds disclosure, per-visitor eligibility, abuse protection and jurisdiction review. A decorative wheel with a predetermined result will not be shipped |
| Dedicated signup landing page | Ready in code | Shareable `/join/{formId}` page uses merchant branding and double opt-in |

## V1 policy

Joon can build an SMS audience before SMS delivery launches. Phone capture is optional, normalized to international E.164 format, and always paired with a separate unchecked SMS choice. Email consent and SMS consent are independent; declining texts cannot prevent email signup or an advertised email incentive. Each consent record carries its form, source, disclosure version, configured market, policy URL, locale and capture time. SMS delivery remains fail-closed until provider and jurisdictional readiness are complete. Shopify protected-customer-data access must include phone before merchants enable phone capture publicly.

The market selector supplies conservative disclosure presets and evidence labeling; it is not a claim that software configuration replaces merchant legal advice. Global forms must preserve purpose limitation, data minimization, demonstrable consent, easy withdrawal, deletion/export and channel-specific suppression. The merchant remains the controller of its collection purpose and campaign, while Joon operates the consent tooling and processor controls.

## Next strength layer

1. Validate the theme-editor section block across representative Online Store 2.0 themes.
2. Surface customer-trait keys in the segment builder as merchant-friendly preference conditions.
3. Add impression, submit, incentive redemption and downstream purchase attribution dashboards.
4. Experiment on form treatment versus no form, offer, delay and creative—not merely raw conversion.
5. Use Joon's decision layer to suppress acquisition offers for known customers who would purchase without a discount.
6. Build spin-to-win only with auditable server-side prize selection and legal configuration by market.

The differentiator is not having more popup templates than incumbents. It is connecting acquisition cost to the same decision ledger: who saw an offer, who subscribed without one, which incentive was issued, whether they purchased, and whether the discount created incremental value.
