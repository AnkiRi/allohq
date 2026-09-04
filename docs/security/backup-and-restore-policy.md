# Backup and restore policy

## Required configuration

- Production PostgreSQL backups must be encrypted at rest by the managed
  provider and transmitted only over TLS.
- Point-in-time recovery is preferred; otherwise retain at least seven daily
  recovery points. The provider setting and retention period must be recorded.
- Backup administration is limited to named production administrators using
  MFA-protected accounts.
- Backups must not be downloaded to personal devices or copied into development
  or staging.
- Redis is treated as disposable queue/cache state; durable system-of-record
  data belongs in PostgreSQL. Queue recovery must preserve the invariant of one
  correct delivery or none, never two.

## Restore drill

Before submitting for protected-customer-data access:

1. Choose a recent production recovery point.
2. Restore it into a temporary, access-restricted database—not staging.
3. Verify schema integrity and aggregate counts for stores, customers, orders,
   consents, suppressions, campaigns and delivery records.
4. Verify that records remain associated with exactly one workspace/store.
5. Do not send messages or invoke external providers from the restored system.
6. Record start/end time, recovery point, checks, result and operator.
7. Destroy the temporary restoration through the provider after verification.
8. Retain provider screenshots and the sanitized drill record.

Repeat after material database architecture changes and at least annually.

