# Joon Shopify listing and review pack

Prepared 3 September 2026. Copy is intentionally free of statistics,
testimonials, merchant names, guarantees and “first/best/only” claims.

## Listing copy

**App name:** Joon

**Card subtitle:** Build approved email journeys and measure them with holdouts

**Short description:** Joon turns a plain-language retention goal into an
audience, offer and branded email for review. Create one-off campaigns or
activate email journeys, require approval before delivery, and compare treated
customers with a deliberately silent control.

**Key benefits:**

- Draft branded Shopify email campaigns from a plain-language request.
- Build welcome, abandoned-checkout, post-purchase, win-back, replenishment and
  customer-milestone email journeys.
- Preview the sendable audience and exclusions before delivery.
- Keep a randomized holdout and report treatment and control outcomes.
- Enforce consent, unsubscribe, suppression, sender verification and merchant
  approval at delivery time.

**Pricing description:** Free public v1. Joon does not charge per email. Any
separate delivery-provider cost remains between the merchant and that provider.

**Primary category/tag:** Email marketing. Do not select SMS, WhatsApp, chatbot,
customer support or advertising categories for v1.

**Sales-channel requirement:** Merchant must have the Online Store sales
channel because the consent-aware Web Pixel supplies storefront behavior used
by activated journeys and analysis.

**Supported language:** English only until the complete merchant UI is localized.

## Media brief

- App icon: 1200 × 1200 PNG or JPEG; Joon mark only; no pricing, Shopify marks,
  statistics, awards or claims.
- Screenshots must use synthetic reviewer-store data and contain no performance
  statistics presented as merchant results.
- Recommended sequence: campaign request; dry-run exclusions and holdout;
  branded email approval; journey builder; treatment/control outcome ledger;
  sender-domain and emergency controls.
- The screencast is in English (or English-subtitled), begins at installation,
  and shows setup plus one complete core flow. Do not use a polished marketing
  montage as the reviewer walkthrough.

## Reviewer setup

Provide in the Partner Dashboard immediately before submission:

- a dedicated reviewer development store;
- a valid staff/test account with full access to every submitted v1 feature;
- the installed Joon app or exact Shopify-origin installation steps;
- a verified test sending domain and seed inboxes—never a real customer list;
- the working support email and emergency developer email/phone;
- public Privacy, Terms, DPA, Subprocessors and Support URLs;
- an explicit note that Joon is email-only and free in public v1.

Credentials belong only in Shopify's secure submission form, never this file.

## Deterministic reviewer walkthrough

1. In a fresh Chrome incognito window, open the app from Shopify Admin and
   install it. Confirm it remains embedded and does not require third-party
   cookies or a separate Clerk login.
2. Confirm the correct shop/workspace appears and initial sync completes without
   an error page. Review customers, products, recent orders, RFM and supported
   product/category segments.
3. Complete sender-domain setup. For review delivery, keep
   `MESSAGING_SEND_MODE=allowlist` and use only the supplied seed inboxes.
4. Ask: “Create a welcome email campaign for opted-in customers.” Open the dry
   run and inspect requested audience, exclusions, sender, content and holdout.
5. Change the content after approval and demonstrate that approval becomes
   invalid. Reapprove the exact version, then send to the seed audience once.
6. Open the message, verify the plain-text alternative and unsubscribe link,
   unsubscribe one seed contact, and show that the contact is suppressed from a
   later dry run/send.
7. Create or open an email-only welcome or abandoned-checkout journey. Activate
   its exact version and show that edits require reactivation.
8. Show the outcome view with clearly synthetic treatment/control records. Do
   not claim statistically significant lift from reviewer fixtures.
9. Show the per-store pause. Explain that the provider-wide kill switch is an
   operator environment control and is not exposed to staff users.
10. Uninstall and reinstall. Confirm there is no duplicate tenant and that
    signed privacy lifecycle handling remains available.

## Pre-submission evidence

Run and preserve output from:

```sh
pnpm launch:check
pnpm -r --if-present test
pnpm typecheck
pnpm --filter @allohq/web build
pnpm --filter @allohq/workers build
```

Then record incognito, Safari, mobile viewport, seed inbox, unsubscribe,
uninstall/reinstall and webhook tests with timestamp, environment and verifier.

## External completion checklist

- [ ] Link and deploy `shopify.app.toml`; all placeholders absent.
- [ ] Run Shopify's automated app-review checks successfully.
- [ ] Submit Level 2 protected customer data and required-field requests before
      app review begins.
- [ ] Configure free pricing in Shopify App Pricing.
- [ ] Upload compliant icon and screenshots.
- [ ] Enter valid review and emergency contacts; allow Shopify review email.
- [ ] Paste current credentials and instructions into the submission form.
- [ ] Attach the English screencast.
- [ ] Legal owner approves and completes public policy/operator details.

## Official sources checked

- https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements
- https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review
- https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review
- https://shopify.dev/docs/apps/launch/protected-customer-data
- https://shopify.dev/docs/apps/launch/privacy-requirements
- https://shopify.dev/docs/apps/launch/distribution/support-your-customers
