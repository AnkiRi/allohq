# Production security configuration

Generate each value independently and store it only in the deployment platform's
secret manager. Never copy development values into staging or production.

```sh
openssl rand -base64 32 # DATA_ENCRYPTION_KEY
openssl rand -base64 48 # WIDGET_VISITOR_SIGNING_SECRET
openssl rand -base64 48 # UNSUBSCRIBE_SIGNING_SECRET
```

## Required placement

| Secret | Web | API | Workers |
| --- | --- | --- | --- |
| `DATA_ENCRYPTION_KEY` | yes | yes | yes |
| `WIDGET_VISITOR_SIGNING_SECRET` | no | yes | no |
| `UNSUBSCRIBE_SIGNING_SECRET` | no | yes | yes |
| `API_BASE_URL` (public HTTPS API origin) | no | yes | yes |
| `RESEND_API_KEY` (when send mode is not disabled) | no | yes | yes |

`DATA_ENCRYPTION_KEY` must be identical across the three services in one
environment. Each environment must use a different pair of keys. The API and
workers terminate during production startup when their required values are
missing or malformed. The Shopify callback also shows merchants a safe
configuration-error message rather than failing silently.

Production startup also fails when unsubscribe signing/link configuration is
missing, when a non-disabled delivery mode has no Resend credential, or when
allowlist mode has no test recipients. `API_BASE_URL` must be the public HTTPS
API origin so every email contains an actionable unsubscribe link.

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

## Emergency delivery controls

- Set `GLOBAL_EMAIL_KILL_SWITCH=true` in every service that can call the email
  provider to stop last-mile email delivery even when `MESSAGING_SEND_MODE=live`.
- A workspace owner can pause an individual store through the store API. Joon
  also applies this pause automatically when complaints reach three in seven
  days, or 0.1% after at least 1,000 deliveries.
- Clearing an automatic store pause requires an owner action after the sender,
  audience, and complaint cause have been reviewed.
