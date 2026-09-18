# Privacy and data-retention policy

Last updated: 2 September 2026

Engineering lifecycle clarification: 18 September 2026

This is the operational retention schedule for Joon's Shopify v1. It is the
engineering source of truth; the public privacy policy must describe the same
behavior before App Store submission.

## Merchant store lifecycle

- Disconnecting Shopify is reversible. Joon immediately stops synchronization and delivery,
  invalidates stored commerce credentials, and retains the store's operational history,
  customer intelligence and verified sender-domain configuration for reconnection.
- Retained disconnected-store data remains until the merchant permanently deletes the store
  data or a verified Shopify `shop/redact` request requires deletion. An automatic
  disconnected-store expiry period is not yet promised; legal review must set one before
  Shopify App Store submission.
- Permanent deletion is a separate, explicit action with exact shop-domain confirmation. It
  deletes the store record and store-scoped data and attempts to deprovision the email-provider
  sending identity.
- Joon cannot remove DNS records at a merchant's external DNS host. The product must tell the
  merchant which records can be removed after permanent deletion.
- Workspace membership is not deleted with one store because a workspace may own other stores.

## Shopify privacy requests

- `customers/data_request`, `customers/redact`, and `shop/redact` are verified,
  idempotent, and processed asynchronously.
- Customer and shop redaction is applied immediately when a valid webhook is
  processed.
- Raw webhook payloads, generated customer exports, customer external IDs, and
  stored failure details are erased after 30 days.
- Minimal audit metadata (event ID, shop domain, topic, status, and timestamps)
  is retained for one year, then deleted.

## Provider webhook inbox

Provider event IDs and processing metadata exist only to make delivery,
unsubscribe, complaint, and bounce webhooks idempotent. They are deleted after
90 days. Durable suppression records are not deleted by this cleanup: they are
required to prevent future unwanted sends and are removed only through an
authorized privacy/deletion workflow.

## Enforcement

The `privacy-retention` worker runs daily at 03:00 Asia/Kolkata. Its schedule is
explicitly classified as allowed by the v1 release gate. Production alerts must
fire if the job does not complete for 48 hours.

Changing these periods requires a legal/privacy review, a matching public-policy
update, and a migration/test update. Production backups must age out deleted
personal data according to the separately documented backup-retention period.
