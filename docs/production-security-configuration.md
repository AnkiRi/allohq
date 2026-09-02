# Production security configuration

Generate each value independently and store it only in the deployment platform's
secret manager. Never copy development values into staging or production.

```sh
openssl rand -base64 32 # DATA_ENCRYPTION_KEY
openssl rand -base64 48 # WIDGET_VISITOR_SIGNING_SECRET
```

## Required placement

| Secret | Web | API | Workers |
| --- | --- | --- | --- |
| `DATA_ENCRYPTION_KEY` | yes | yes | yes |
| `WIDGET_VISITOR_SIGNING_SECRET` | no | yes | no |

`DATA_ENCRYPTION_KEY` must be identical across the three services in one
environment. Each environment must use a different pair of keys. The API and
workers terminate during production startup when their required values are
missing or malformed. The Shopify callback also shows merchants a safe
configuration-error message rather than failing silently.

## Rotation

The current encrypted-value format supports one active encryption key. Do not
replace `DATA_ENCRYPTION_KEY` until a multi-key decrypt/re-encrypt migration is
implemented and tested; replacing it directly makes existing Shopify tokens
unreadable. `WIDGET_VISITOR_SIGNING_SECRET` can be rotated directly: existing
visitor tokens become invalid for at most ten minutes and widgets obtain a new
one automatically.

Provider credentials (Shopify, Resend, Clerk, Redis, and database credentials)
must be rotated in their provider consoles before onboarding an external store.
Record owner, rotation date, and verification result in the release checklist;
do not put secret values in tickets, logs, or this repository.
