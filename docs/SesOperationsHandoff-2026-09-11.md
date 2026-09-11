# SES operations handoff

Status: implementation is present but disabled. `EMAIL_PROVIDER` remains `resend`; messaging remains fail-closed. Do not enable SES until AWS tenant availability, SNS/SQS/DLQ wiring, sandbox reconciliation drills, quota and DNS are externally verified.

## Architecture

Use per-store SES configuration sets `joon-triggered-{storeHash}` and `joon-broadcast-{storeHash}`. Provision each event destination to the configured SNS topic, subscribe an encrypted SQS queue, and consume it from the gated worker with a DLQ redrive policy. SQS is preferred over a public webhook because retries, backpressure and DLQ inspection are native. Normalize Send, Delivery, DeliveryDelay, Bounce, Complaint, Open, Click, Reject and Rendering Failure into the provider-neutral message-event effects. Deduplicate on the provider event id, or a canonical payload hash when SES omits one. Invalid topic envelopes and poison messages are not acknowledged and therefore redrive to the DLQ.

SES has no provider idempotency key. A transport error after submission is ambiguous: mark it for reconciliation and never retry blindly. A matching tagged Send event confirms acceptance. If none arrives after 15 minutes, require manual review; absence of an event does not prove non-delivery.

## Founder actions

- Request production access for permission-based Shopify marketing email. Explain one-click unsubscribe, suppression before send, hard-bounce and complaint suppression, complaint-pausing, per-tenant isolation and staged warmup.
- Request quota and maximum send rate based on the largest approved blast. Runtime concurrency must use `GetAccount.MaximumSendRate`; do not hardcode throughput.
- Create one SES tenant per store with Standard reputation policy where region availability permits. Confirm tenant support in `ap-south-1`; otherwise document the selected region before provisioning.
- Create Easy DKIM identity per merchant domain and custom MAIL FROM subdomain. Surface the three DKIM CNAMEs, MAIL FROM MX/TXT and DMARC guidance in Joon.
- Supply least-privilege credentials through the deployment secret manager. Do not place credentials in repository files.

## Least-privilege policy outline

Restrict resources to Joon identities, configuration sets and tenants. Required actions: `ses:SendEmail`, `ses:GetAccount`, identity/configuration-set/tenant read and provisioning actions needed by the domain onboarding service. Event infrastructure separately needs scoped SQS receive/delete/change-visibility and SNS subscription administration during provisioning.

## Enforced warmup contract

Per store, the worker starts at `min(eligible, 500 * 2^(day-1))`; excess recipients receive an explicit next-day queue job without changing frozen arms or delivery keys, and suppression is rechecked when that job runs. It prioritizes customers who clicked or purchased within 30 days, then 90 days, then the remainder; opens do not raise priority. Over rolling seven days, growth is held for three days above 2% bounce or 0.1% complaint, and the store is paused above 0.3% complaint. A founder override requires a recorded reason and timestamp. The proposed 180-day unengaged sunset is stored but remains disabled.

Enabling delivery also requires `SES_TENANT_REGION_CONFIRMED=true`, a 12-digit `AWS_ACCOUNT_ID`, a verified `SES_FROM_EMAIL`, and queue/topic values whose SNS ARN matches the configured account and region. This explicit gate prevents assuming tenant support in `ap-south-1` before AWS confirms it.

Sandbox verification uses only `success@simulator.amazonses.com`, `bounce@simulator.amazonses.com` and `complaint@simulator.amazonses.com`. Do not run a 70,000-message simulator blast: sandbox rate and quota make that neither representative nor responsible.
