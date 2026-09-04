# Shopify protected customer data evidence — public email v1

Last verified: 3 September 2026

This is the engineering evidence source for Shopify's protected customer data
request. Dashboard answers must remain narrower than or equal to this
implementation. It is not a substitute for Shopify's approval.

## Purpose and requested access

Joon needs customer identity and email consent to determine who may receive
merchant-approved email; recent orders and line items for RFM/product segments,
recent-purchase restraint, activated journeys and treatment/control outcomes;
checkout state for an approved abandoned-checkout journey; and fulfilment state
for journey conditions and outcome context.

Joon does not request `read_all_orders` or write access to customers, products
or orders. The initial import uses Shopify's standard order window and the
longitudinal decision/outcome ledger begins at installation.

## Field inventory and minimization

| Data | Stored fields | V1 purpose |
| --- | --- | --- |
| Shop | domain, name, contact email, business address, currency, timezone | tenant, locale, sender setup, reporting and compliant footer defaults |
| Customer | Shopify ID, email, name, tags, timestamps | consent lookup, email personalization, segmentation, deletion lookup |
| Consent | customer, email channel, state, opt-in level/source, update time | fail-closed eligibility |
| Order | ID/number, customer, totals, tax/shipping, currency, status, time | RFM/LTV, restraint and outcomes |
| Line item | product/variant IDs, title, quantity, price | category affinity, replenishment evidence, margin analysis |
| Checkout | ID, customer/email, items, total/currency, recovery URL, state/time | activated abandoned-checkout journey |
| Storefront event | event ID/type, pseudonymous visitor/session/customer IDs, minimized data, time | activated behavior journeys and aggregate paths |
| Delivery event | provider/message ID, status, time | idempotency, reporting and suppression |

Phone and customer-address fields are not requested in v1. The Web Pixel rejects direct email, phone, name, address,
billing, shipping, credit-card and payment-detail keys before persistence.
Anonymous events cannot trigger email; identified events resolve only to an
existing customer inside the same store.

## Access control and audit

- Store/object resolvers verify workspace ownership before access.
- Embedded requests verify Shopify ID-token signature, issuer, audience,
  destination and time claims, then map staff to one installed shop/workspace.
- Standalone requests verify Clerk tokens against explicit authorized parties.
- Successful customer-bearing API accesses emit structured
  `protected_customer_data_access` logs containing route, actor, workspace,
  authentication source and timestamp—never customer payloads or credentials.
- Shopify offline tokens are AES-256-GCM encrypted and loaded by store ID inside
  trusted workers, never included in queue payloads.

Production hosting must retain and restrict audit logs according to the approved
security policy. Console evidence of retention and access roles remains a
deployment action.

## Deletion, export and retention

Mandatory `customers/data_request`, `customers/redact` and `shop/redact`
webhooks are HMAC verified and idempotent. Valid redactions are applied by the
privacy worker. Raw privacy payload/export/failure details are scrubbed after
30 days; minimal request audit metadata after 365 days; provider webhook
deduplication records after 90 days. Durable suppressions remain until an
authorized privacy/deletion workflow so deletion cannot cause unwanted mail.
See `docs/privacy-retention-policy.md`.

## Security and operational controls

- Production startup fails closed without encryption/signing secrets.
- OAuth and webhooks are signature verified and replay IDs deduplicated.
- Email is disabled by default and needs explicit allowlist/live mode.
- Global/store stops, verified senders, approval checksums, final consent and
  suppression checks, stable delivery keys, rate limits and new-store caps run
  before provider delivery.
- Critical terminal failures enter a DLQ index; replay requires an exact ID and
  retries only the retained failed original.

Joon's operating policies and evidence templates are maintained in:

- `docs/security/data-loss-prevention-policy.md`
- `docs/security/incident-response-policy.md`
- `docs/security/privileged-access-policy.md`
- `docs/security/backup-and-restore-policy.md`
- `docs/security/evidence/`

## Evidence locations

- Scopes/OAuth: `packages/ecommerce-integrations/src/shopify/`
- Tenant guards/identity: `apps/api/src/lib/storeAccess.ts`, `apps/api/src/auth/`
- Pixel minimization: `apps/api/src/storefront-events.ts`
- Privacy: `apps/workers/src/workers/shopify-webhook.worker.ts`, `apps/workers/src/privacy-retention-policy.ts`
- Delivery controls: `packages/messaging/src/`, `apps/workers/src/workers/send.worker.ts`, `apps/workers/src/workers/automation-runner.worker.ts`
- Access audit: `apps/api/src/lib/protected-data-audit.ts`
