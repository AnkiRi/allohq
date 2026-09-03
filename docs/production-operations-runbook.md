# Production operations runbook

## Stop delivery first

For a suspected duplicate, wrong audience, stale approval, complaint spike or
provider incident, set `GLOBAL_EMAIL_KILL_SWITCH=true` on API and workers. Pause
the affected store in Joon as soon as its identity is known. Do not clear either
control until the queued jobs, audience, approval version and provider events
have been reconciled.

## Failed critical jobs

Workers copy terminal failures from `email-send`, `automation-trigger` and
`shopify-webhook` into the `dead-letter` queue. The original failed job remains
the source of truth; the DLQ record is an index and audit aid.

```sh
pnpm --filter @allohq/workers queue:ops list
QUEUE_REPLAY_CONFIRM=<exact-dlq-id> pnpm --filter @allohq/workers queue:ops retry <exact-dlq-id>
```

Retry requires the exact DLQ ID, refuses to reconstruct a missing job, and
refuses any original job that is no longer failed. Before retrying a send job,
confirm the stable delivery key, current approval checksum, current consent and
suppression, verified sender and store/global delivery state. The final worker
checks still apply; never bypass them by creating a replacement job manually.

## Restore drill

Enable managed PostgreSQL point-in-time recovery and Redis persistence in each
environment. At least monthly, restore production backup material into an
isolated, access-restricted drill environment; verify row counts for stores,
customers, suppressions, campaigns, automation activations, experiment arms,
decision records and message logs. Never point restored workers at a live email
provider. Record recovery point, recovery time, verifier and discrepancies.

## Minimum alerts

Page the operator for API readiness failure, database or Redis unavailability,
critical DLQ growth, email-provider 429/5xx spikes, queue age/depth, campaign or
journey failure, complaint/bounce/rejection auto-pause, disk/database saturation
and anomalous AI/provider spend. Alerts and backup policies are configured in
the hosting/provider consoles and require a real recipient and escalation test.

## Deployment acceptance

Run `pnpm launch:check` with the production environment loaded. It checks
required configuration without printing secret values, verifies the v1 and
delivery-mode boundaries, rejects an unlinked/placeholder Shopify config, probes
API readiness and confirms every public trust URL. A failing result blocks
submission and live delivery.

## Credential rotation

Follow `docs/production-security-configuration.md`. Rotate provider-side
credentials before external merchants connect. Never rotate the single active
data-encryption key without first shipping a multi-key re-encryption migration.
