# Joon launch plan — 3 September 2026

Status: active source of truth  
Release: free, fully visible Shopify App Store listing  
Initial product: Shopify + email campaigns + merchant-approved email automations and journeys

## 1. Launch decision

Joon launches as a complete email decision product, not as an unfinished
multichannel suite.

In scope:

- Shopify-origin installation and embedded Admin experience.
- Store, customer, product, order, consent, and outcome synchronization.
- Natural-language request to a structured campaign draft.
- Reusable email templates and brand-aware email generation.
- One-off email campaigns.
- Merchant-created or Joon-drafted email automations and multi-step journeys.
- Explicit merchant approval of the exact campaign or automation version.
- Randomized holdouts by default and treatment/control reporting.
- Subject, content/tone, discount, and send-time experiments where the behavior
  is implemented and honestly labelled.
- A free App Store plan. No Shopify Billing API is required for v1.

Out of scope for launch:

- SMS, WhatsApp, and RCS creation or delivery.
- Channel selection or channel-preference learning.
- Autopilot, unapproved proactive outreach, or autonomous campaign creation.
- Cross-brand intelligence exposed to merchants.
- Individual-outcome prediction claims.
- Performance billing or per-message pricing.

The multichannel adapters, consent schema, suppression records, and historical
data remain in the codebase behind a fail-closed release gate. They are not
advertised or operable in the submitted app. Expansion order is WhatsApp with
fixed approved templates, then market-specific SMS/DLT, then RCS.

## 2. Positioning

Core claim:

> The email tool that gets paid to send less.

Proof clause:

> Joon holds customers back on purpose, then shows which of them bought anyway.

Category framing:

> Sending got commoditized. Deciding did not.

Judge.me and low-cost ESPs are delivery infrastructure, not the strategic
enemy. Joon must never compete on cents per thousand emails or earn more by
sending more. V1 is free. A future paid model should price decision value only
after attribution is proven.

## 3. Verified state

Branch `send-path` was synchronized with `origin/send-path` at `72854a5` before
this closure update. Earlier planning began at `3042980`.

Implemented and verified:

- OAuth state and HMAC validation.
- GraphQL Admin API `2026-07` for known operational calls.
- Encrypted Shopify access and refresh tokens; tokens excluded from queue jobs.
- Expiring offline-token refresh.
- Mandatory privacy webhooks, idempotency, retention, and deletion workers.
- Revocable storefront public keys, exact origin allowlists, and short-lived
  visitor tokens.
- Signed unsubscribe tokens and durable per-channel suppression.
- Email delivery disabled by default, explicit allowlist/live modes, global
  provider kill switch, per-store pause, and complaint-triggered pause.
- Campaign approval checksum and invalidation on covered changes.
- Automation activation versions and checksum verification at execution.
- Email-only release gate at API, scheduler, automation, legacy-journey, and
  final provider boundaries.
- Merchant-approved email automations and journeys remain enabled.
- Legacy proactive browse, repurchase, and inventory scanners remain blocked.
- Campaign and automation holdouts, treatment/control records, state snapshots,
  and provider/database delivery idempotency.
- Phone-channel template/editor/provider controls removed from the v1 UI.
- Model harness with unified and workload-specific routing.

Known caveats requiring a deployed environment or external decision:

- App Bridge request authentication, Shopify staff mapping, and Shopify-origin
  tenant creation are implemented. Their incognito, staff, uninstall/reinstall,
  and multi-store lifecycle still needs validation inside a real linked Shopify
  app.
- `shopify.app.example.toml` exists, but no linked/deployed
  `shopify.app.toml` exists.
- `read_all_orders` is removed for public v1; onboarding uses Shopify's standard
  order window and Joon's longitudinal ledger compounds from installation.
- Sending-domain onboarding and live-send verification are implemented in code;
  provider DNS validation in a production environment remains.
- Campaign and automation preflight share the canonical audience rules. Campaign
  approval freezes the eligible IDs and dispatch intersects that snapshot with
  a fresh safety check, so approval cannot silently expand its audience.
- Tone is captured as a feature/variant; outcomes do not yet change future tone
  selection. Do not call this tone learning.
- Send-time selection is consolidated into one on-demand implementation with
  explicit customer/store/default evidence labels and merchant-local hours.

## 3A. Implementation phase tracker

This section maps day-to-day engineering work to the release stages below.
“Stage” describes the launch gate; “phase” describes the concrete sequence of
changes used to complete that gate.

### Current position

The repository-only launch work is complete as of **4 September 2026**. The
critical path has moved to linked/deployed validation: production Shopify app
configuration, live embedded lifecycle acceptance, provider/DNS setup, failure
drills against real services, legal/operator approval, and submission.

Production configuration audit on **4 September 2026**:

- Shopify version `Joon-Email-V1` is released with the intended minimal scopes
  and Webhooks API `2026-07`. The version currently changes the merchant-facing
  app name to `Joon-Email-V1`; the next version must restore the app name to
  `Joon` while using `Joon-Email-V1` only as the version label.
- The released version still contains localhost and legacy `agent.allohq.ai`
  callback URLs. The checked-in production config retains only
  `https://agent.joonhq.com/api/shopify/callback`.
- `https://agent.joonhq.com` is the embedded web application.
- `https://api.allohq.ai` is the current API host. `/webhooks/shopify` and
  `/webhooks/resend` reach their handlers. `/healthz` remains 404 until the
  launch-ready API build is deployed; the route exists on `send-path`.
- Operational Shopify webhooks remain shop-specific and are registered during
  sync. The app config declares only the three mandatory compliance topics to
  avoid duplicate operational deliveries.
- The Web Pixel extension is now part of the pnpm workspace and app source, but
  it does not become active for installed shops until a Shopify CLI app version
  containing the extension is deployed and released.
- Protected Customer Data is still a draft. Phone and address are excluded;
  name and email remain because an email product cannot operate without them.

### Level 2 protected-customer-data controls

Name and email are Level 2 fields. Shopify requires both the Level 1 and Level
2 safeguards for public apps that use them. These are launch requirements, not
optional questionnaire optimizations: an unsupported “Yes” can fail evidence
review, while “No” can prevent Joon receiving the data it needs.

| Control | Required operating evidence | Current status |
| --- | --- | --- |
| Encrypted backups | Managed encrypted backups/PITR, retention setting, and a recorded restore test | External setup and restore drill pending |
| Separate test and production data | Separate app/services/database/Redis/provider credentials; no copied production PII in test | External staging environment pending |
| Data-loss prevention | Data inventory, least privilege, log redaction, controlled exports/egress, deletion and alerting | Code controls partly done; operating policy/evidence pending |
| Staff access restrictions | Named need-to-know access, MFA, role assignment and periodic access review across Shopify, Railway, GitHub, Clerk and providers | Founder/operator setup and evidence pending |
| Strong passwords | SSO/MFA or provider-enforced strong-password controls for every privileged account | Provider configuration evidence pending |
| Personal-data access logging | Tenant, actor, purpose/action and timestamp logs with protected retention and review | Code done; production deployment/retention/review proof pending |
| Incident-response policy | Named owner, severity/escalation rules, containment, merchant/Shopify notification and a tabletop exercise | Runbook exists; owner approval and exercise pending |

Do not submit the protected-data request until every row can be answered
truthfully and backed by a screenshot, configuration export, log sample, policy,
or drill record.

The checked-in gates are now executable rather than documentary:

- `pnpm test` discovers all repository unit tests (33 files, 94 tests at this
  checkpoint) instead of only packages that happened to expose a test script.
- `pnpm lint` runs on ESLint 9 and passes with zero errors; warning-level legacy
  debt remains visible.
- `pnpm typecheck` passes all 18 workspaces.
- API, web, and worker production builds pass.
- `pnpm launch:check` runs and intentionally remains red until production
  credentials, deployed URLs, and a linked `shopify.app.toml` are supplied.

The App Bridge work belongs to **Stage 1 — Shopify embedded foundation**:

- `76692d4` completed phase 1A: load Shopify's current App Bridge bootstrap in
  the application shell and provide its public client ID/API origin.
- `85eead5` completed phase 1B: verify Shopify's short-lived ID token on the
  backend, including signature, expiry, activation time, intended app, issuer,
  destination shop, and Shopify-domain checks.
- `a58ec1c` completed phase 1C: embedded API requests obtain a fresh ID token;
  the API accepts it only for exactly one active installed shop and maps a newly
  seen staff identity into that workspace as a non-owner member.
- Phase 1D now has a one-time installer-admin claim and safe member default;
  multi-store and cross-shop live validation remain.

App Bridge engineering is complete through tenant/role mapping and
Shopify-origin installation. Stage 1 remains open because its exit gate is a
live Shopify lifecycle test, not because another repository-only auth component
is known to be missing. Clerk remains available for standalone development;
embedded requests authenticate with fresh Shopify ID tokens.

### Phase-to-stage map

| Implementation phase | Concrete result | Launch stage | Status |
| --- | --- | --- | --- |
| 0A — Release boundary | Email-only provider gate; autopilot/proactive schedules fail closed | Stage 0 | Done (`ecdfa96`, `7e1fd6f`, `3042980`) |
| 0B — Approved email journeys | Email automations remain usable; activation versions/checksums prevent unreviewed changes | Stage 0 | Done (`226955f`, `295cee0`) |
| 0C — Product-surface boundary | SMS/WhatsApp/RCS writes blocked and creation/provider controls removed from v1 UI | Stage 0 | Done (`482d69f`, `c61a4a8`) |
| 0D — Delivery safety base | Kill switches, store pause, complaint pause, campaign approval invalidation | Stages 0 and 4 | Done (`5a9d320`, `5d4ce32`) |
| 0E — Journey causal ledger | Automation holdouts, treatment/control records, state snapshots, database/provider idempotency | Stages 3 and 5 | Foundation done (`aab5903`); full drills pending |
| 1A — App Bridge bootstrap | Joon loads as an App Bridge-capable embedded document | Stage 1 | Done (`76692d4`) |
| 1B — Shopify ID-token verification | Backend can reject forged, expired, wrong-app, and cross-shop tokens | Stage 1 | Done (`85eead5`) |
| 1C — Shopify request authentication | Frontend API calls carry fresh ID tokens; API resolves shop and staff identity without Clerk cookies | Stage 1 | Done (`a58ec1c`); live Shopify validation remains in 1F |
| 1D — Tenant and role mapping | One verified Shopify shop maps to one Joon store/workspace; first verified session on a fresh install claims admin once, later staff default to member | Stage 1 | Code path done (`b1632f7`); multi-store/live validation remains in 1F |
| 1E — Shopify-origin install | OAuth callback creates/reuses the shop tenant without a Clerk cookie; token exchange and encrypted persistence work | Stage 1 | Code done (`b1632f7`); live Shopify validation remains in 1F |
| 1F — Lifecycle recovery | Refresh, incognito, staff access, uninstall, reinstall, expired/revoked access and errors work safely | Stage 1 | Code paths done; blocked on live linked-app acceptance |
| 1G — Linked Shopify configuration | Real `shopify.app.toml`, URLs, scopes and webhooks are linked and deployed | Stage 1 | Source config now prepared for app `325227249665`; Shopify CLI validation/deploy/release remains external |
| 1H — Customer-event pixel | Consent-aware Shopify Web Pixel captures page/product/collection/search/cart/checkout events with data minimization and event-id dedupe | Stages 1 and 3 | Code done (`bd00a2c`); Shopify-linked extension deploy/live validation remains in 1G/1F |
| 2A — Scope audit | Operational Shopify calls are GraphQL Admin 2026-07; `read_all_orders` and write access to orders/products/customers are excluded, with a scope regression test | Stage 2 | Code audit done in current slice; Partner Dashboard scope synchronization remains in 1G |
| 2B — Level 2 evidence | Data inventory, minimization, access logging, retention/deletion evidence and Dashboard request | Stage 2 | Engineering evidence pack and structured tenant/actor access logs done in current slice; production log-retention proof and Dashboard submission remain external |
| 2C — Public trust surface | Stable public Privacy Policy, ToS, DPA, subprocessors and support routes, linked from the landing page | Stage 2 | Code draft done in current slice; operator details, deployed-vendor inventory and counsel/founder approval remain external |
| 2D — Review/listing pack | Free plan, icon, screenshots, copy, reviewer store/instructions and screencast | Stage 2 | Shopify-compliant copy, media brief and deterministic reviewer walkthrough drafted in current slice; Dashboard configuration, final assets, credentials and screencast remain external |
| 3A — Canonical audience resolver | Campaign preview/dispatch and automation preflight share consent, suppression, pause and governor exclusion semantics; automation execution rechecks the same permission/governor boundaries at each delivery | Stage 3 | Code done (`3a2025d` + current slice); live journey validation remains in Stage 5 |
| 3B — Dry-run report | Campaign and automation pages show requested/currently-sendable, mutually exclusive exclusions, estimated treatment/control and sender/domain state with zero provider calls | Stage 3 | Done (`3d6f431`): approval freezes sorted eligible IDs inside the checksummed proposal; dispatch intersects them with fresh safety eligibility; UI exposes provider-cost state |
| 3C — Margin-risk moment | Campaign preflight surfaces eligible customers who purchased in the prior seven days, their observed order subtotal and explicitly illustrative discount exposure; copy disclaims any repurchase prediction | Stage 3 and GTM | Code done in current slice; validate wording/currency with live fixtures in Stage 5 |
| 3D — Event-trigger semantics | Identified Shopify events enter only active merchant-approved journeys; retries dedupe but genuinely later events can retrigger | Stage 3 | Done (`7d3fde4`); anonymous events remain analysis-only by design |
| 4A — Sender-domain onboarding | Provider DNS records/status are displayed and refreshed; campaign and automation workers require a verified From domain before live delivery | Stage 4 | Code done in current slice; production provider/DNS validation remains |
| 4B — Distributed limits | One Redis-atomic admission gate protects campaign and automation provider calls with daily caps, expiring per-store concurrency leases, a seven-day new-store ramp and shared provider throttling | Stage 4 | Code done in current slice; production load validation remains in Stage 5 |
| 4C — Deliverability automation | Signed/idempotent provider events suppress affected contacts and auto-pause a store on complaint, hard-bounce or provider-rejection safety floors/rates; distributed admission caps anomalous volume | Stage 4 | Code done in current slice; production webhook validation remains in Stage 5 |
| 5A — Failure harness | Production drills cover 429/5xx backoff, accepted-then-timeout idempotency, permanent failures, post-fan-out approval mutation and unsubscribe/complaint after queueing; suppression and opt-out outrank legacy consent at the final delivery check | Stage 5 | Provider + approval + consent drills done; provider failures enter failed/DLQ state; delayed journey continuations now have stable execution/step IDs and preserve event identity across restarts. Live database/webhook interruption drills remain |
| 5B — Six journey fixtures | Welcome, cart, post-purchase, win-back, evidence-backed replenishment and loyal-customer milestone generate email-only workflows with executable triggers; replenishment runs only when merchant-activated and dedupes per customer/day | Stage 5 | Deterministic workflow fixtures pass 6/6 in current slice; live DB/queue/provider acceptance remains |
| 5C — Email-client matrix | Every provider email now includes a generated plain-text alternative with deterministic tests for stripped styling/scripts, lists and entities | Stage 5 | Plain-text foundation done in current slice; Gmail/Outlook/Apple visual and dark-mode validation remain external/client-assisted |
| 6A — Timing consolidation | Campaigns and journeys use one on-demand, store-timezone learner with customer/store evidence thresholds; every campaign decision records source and confidence, and obsolete scheduled state mutation is removed | Stage 6 | Code done in current slice; validate daylight-saving and live-event distributions in Stage 5 |
| 6B — Content feedback loop | Evaluation can conclude a subject test but cannot mutate an approved journey in v1; a merchant explicitly applies the winner, which updates the real email template and forces journey reactivation | Stage 6 | Subject loop done in current slice; content-style selection remains pending and is not exposed |
| 6C — Claim audit | Public landing states email-only, free v1, explicit approval and illustrative—not merchant—figures; merchant settings no longer offer autopilot and customer pages no longer expose dead direct SMS actions | Stage 6 | Public and primary authenticated control surfaces done in current slices; historical multichannel display adapters remain intentionally dormant behind the release gate |
| 6C.1 — Email-only decision capture | Campaign planning records email as the selected medium and performs no unusable per-customer channel recommendation query | Stage 6 | Done (`cf81919`); broader copy audit remains in 6C |
| 6D — First-run smart segments | Shopify taxonomy + catalog signals normalize into 20 verticals; verified purchase affinities and behavior segments refresh immediately after RFM | Stage 6 | Done (`1497757`); live-catalog validation remains in Stage 5 |
| 7A — Production operations | Separate environments, backups/restore, alerts, DLQ/replay, runbooks and credential rotation | Stage 7 | Startup fails closed on critical email config; terminal critical-queue failures are indexed in a DLQ with exact-ID guarded retry and an operations runbook. Environment separation, provider alerts and managed backup/restore activation remain external |
| 7B — Submission | Final automated/manual acceptance run and Shopify review submission | Stage 7 | Automated gate and complete test/lint entrypoints done (`1cd9041`, `d75d5d4`, `437c327`, `72854a5`); deployed run, live Shopify walkthrough and submission remain external |

### Stage 1 authentication flow: before, now, and target

Before phase 1A:

`Clerk cookie/token -> Joon user -> workspace -> API`

After phases 1A and 1B:

`Shopify Admin -> App Bridge can issue ID token -> Joon can verify token`

After phases 1C–1E (current code state):

`Shopify Admin -> fresh ID token -> verified shop + staff -> authorized Joon
workspace/store -> API`

The separate encrypted offline Shopify access token remains responsible for
background GraphQL calls, sync, webhooks, and discount creation. An App Bridge
ID token proves the current human identity; it is not an Admin API credential.

### How progress will be recorded

For every implementation commit:

1. Update the applicable phase above from `Pending` to `In progress` or `Done`.
2. Attach the commit hash and the verification performed.
3. Mark the release stage complete only after its stated exit gate passes.
4. Record external blockers explicitly instead of treating console/provider
   configuration as engineering completion.

## 4. Release stages

Stages are gates, not calendar promises. A stage completes only when its exit
criteria pass.

### Stage 0 — freeze the product contract

Objective: prevent scope drift while launch work proceeds.

Engineering:

- Keep `V1_RELEASE_MODE` fail-closed.
- Keep campaigns, approved email automations, and email journeys in scope.
- Keep SMS, WhatsApp, RCS, autopilot, and proactive scanners blocked at points
  of effect.
- Update stale documentation and tests to this contract.
- Add a CI assertion that production builds cannot silently lift the boundary.

Exit gate:

- Product copy, backend gates, worker registrations, tests, and this plan agree
  on one boundary.

### Stage 1 — Shopify embedded foundation (critical path)

Objective: make installation and daily use conform to Shopify App Store
requirements.

Engineering:

- Create and link `shopify.app.toml` from the reviewed example.
- Install the current App Bridge script before other app scripts.
- Start installation from a Shopify-owned surface; eliminate the merchant-typed
  shop domain as the primary App Store flow.
- Validate Shopify ID/session tokens server-side for embedded requests without
  relying on third-party cookies or browser local storage.
- Reconcile Shopify identity with the existing Joon user/workspace model:
  shop owner, staff users, multi-store workspaces, uninstall, reinstall, and
  revoked access.
- Make OAuth callback recovery work when no Clerk session cookie exists.
- Add top-level embedded navigation/loading/error handling and preserve a safe
  standalone development path only where needed.
- Test Chrome incognito and Safari privacy restrictions.

Founder/console actions:

- Create or select the production Shopify app in the Dev Dashboard.
- Provide app client ID, production app URL, callback URL, and webhook URL.
- Resolve the current zero-scopes Dashboard configuration.

Exit gate:

- From a fresh development store, clicking Install inside Shopify reaches Joon,
  authenticates without a third-party cookie dependency, creates the correct
  workspace/store membership, syncs, survives refresh, supports staff access,
  uninstalls cleanly, and reinstalls without duplicate tenants.

### Stage 2 — review and data-access readiness

Objective: make the app legally and operationally reviewable.

Engineering:

- Exhaustively scan for Shopify REST calls and replace any operational use.
- Decide `read_all_orders`: remove it if the launch experience works with the
  normal order window; otherwise document exact features, fields, retention,
  and merchant benefit requiring it.
- Produce Level 2 protected-customer-data evidence: field inventory, purpose,
  access controls, encryption, access logging, retention, export, and deletion.
- Publish Privacy Policy, Terms of Service, DPA, subprocessor list, and support
  policy on stable public URLs.
- Create reviewer-safe demo data and a deterministic review walkthrough.
- Prepare icon, screenshots, listing copy, test credentials, and screencast.

Founder/console actions:

- Submit protected customer data and field requests in the Dev Dashboard.
- Configure the free plan in Shopify App Pricing.
- Supply legal entity/contact information and operate the published support
  address.

Exit gate:

- Every requested scope and protected field maps to a visible v1 function.
- Legal URLs are public and accurate.
- A reviewer can complete the intended flow with provided instructions and no
  404, 500, dead control, or hidden dependency.

### Stage 3 — canonical audience and dry run

Objective: show exactly who can receive a message before any provider call.

Build one shared resolver used by campaigns and automations. It must return an
immutable eligible set plus mutually exclusive exclusion counts for:

- missing/invalid email;
- no email-marketing consent;
- unsubscribe;
- complaint;
- hard bounce;
- manual suppression;
- fatigue cap;
- quiet hours or scheduled deferral;
- duplicate/already delivered;
- store/global pause;
- randomized control assignment.

The dry-run UI must show:

- requested audience and frozen eligible audience;
- every exclusion count and an inspectable sample;
- treatment and control counts;
- sender/from/reply-to and verified-domain state;
- subject, content, concrete offer, schedule, estimated provider cost, and
  approval checksum/version;
- zero provider calls.

Add the launch-critical margin moment:

> “2 of these 20 already bought this week. Joon recommends holding them out;
> sending the discount may burn ₹4,200 of margin.”

This must be framed as an evidence-based recommendation, not a guaranteed
counterfactual. The displayed arithmetic, inputs, and reason must be auditable.

### Storefront and commerce event coverage

Two Shopify sources are intentionally combined:

- Admin webhooks are authoritative for products, customers, orders, checkouts,
  collections, fulfillments, uninstall, and privacy lifecycle changes.
- The consent-aware Web Pixel is authoritative for storefront behavior:
  page views, product views, collection views, search, cart view/add/remove,
  checkout start/contact/address/shipping/payment steps, and completion.

Every pixel event uses Shopify's event ID as a store-scoped idempotency key.
Direct contact, address, and payment fields are stripped before persistence.
For a logged-in customer, only the Shopify customer ID is sent and resolved to
an existing store-scoped customer server-side. Those identified events may
enter an explicitly activated automation. Anonymous events are retained for
aggregate/path analysis and cannot trigger an email until there is a safe,
deterministic identity link.

`cart_abandoned` is deliberately not a browser event. Checkout create/update
opens or refreshes checkout state; the abandonment worker waits for the
inactivity threshold, confirms no subsequent order, marks the checkout
abandoned, and only then invokes an approved cart journey.

### First-install intelligence after RFM

The initial enrichment chain is now:

`Shopify sync -> RFM + LTV -> taxonomy-aware product segments`

The catalog stores Shopify Standard Product Taxonomy IDs/names. A stable
20-vertical vocabulary covers apparel, footwear, jewellery, bags/accessories,
skincare, makeup, haircare, personal care, fragrance, nutraceuticals,
fitness/sports, food/pantry, beverages, home/decor, kitchen/dining,
electronics, baby/kids, pet care, books/stationery, and garden/plants.

Joon shows only segments supported by the merchant's own purchase evidence:
normalized category buyers plus product loyalists, multi-category explorers,
bundle buyers, one-time buyers, and high-value repeaters. It does not fabricate
memberships or industry benchmarks for a new store. Empty/small catalogs still
receive RFM segments and gain affinity segments as evidence arrives.

Exit gate:

- The same resolver determines preview and delivery eligibility.
- Changing audience, content, sender, offer, schedule, or holdout invalidates
  approval.
- Re-running the same dry run is deterministic for the same frozen inputs.

### Stage 4 — production email identity, caps, and deliverability

Objective: make a live send safe for an unknown App Store merchant.

Engineering:

- Add merchant-domain onboarding with states:
  `not_started`, `dns_pending`, `verifying`, `verified`, `failed`, `revoked`.
- Generate and display provider-specific SPF/DKIM records; check DMARC and
  surface actionable errors.
- Permit live delivery only from a verified sender identity. A shared Joon
  domain is for controlled staff testing, not broad merchant marketing.
- Add atomic Redis-backed daily caps, per-store concurrency, provider rate
  limits, and new-store ramp limits.
- Add automatic pause thresholds for bounces, complaints, provider rejection,
  and anomalous volume.
- Add plain-text email fallback and final preflight checks.

Exit gate:

- An unverified domain cannot enter live mode.
- Limits remain correct across multiple API/worker processes and restarts.
- The kill switch and per-store pause stop both campaigns and automations before
  the provider is touched.

### Stage 5 — failure drills and journey acceptance

Objective: demonstrate “one correct delivery or none, never two.”

Required drills:

- Provider 429 and 500 responses.
- Provider timeout after accepting a message.
- Duplicate Shopify and Resend webhooks.
- Redis and worker restart during a campaign and during a delayed journey.
- Revoked/expired Shopify token.
- Discount creation failure.
- Unsubscribe, complaint, or pause after approval but before delivery.
- Content or audience mutation after approval.
- Database interruption at queue, provider-call, and status-update boundaries.

Validate these journeys end to end:

1. Welcome series.
2. Abandoned checkout.
3. Post-purchase follow-up.
4. Win-back.
5. Replenishment reminder implemented through an explicitly activated
   automation, not the blocked proactive scanner.
6. Anniversary or customer milestone.

Email client matrix:

- Gmail, Outlook, Apple Mail.
- Desktop and mobile.
- Light and dark mode.
- Images blocked.
- Missing/long customer names and empty product recommendations.
- Working plain-text fallback, unsubscribe, reply-to, and tracking.

Exit gate:

- Each drill has preserved evidence and passes the delivery invariant.
- Treatment, control, delivery events, unsubscribe, and outcome reconcile to
  one logical message/decision record.

### Stage 6 — honest learning claims

Objective: ensure public claims match implemented feedback loops.

Engineering:

- Remove `getBestChannel` from v1 campaign planning and record email directly.
- Consolidate send-time calculation into one implementation with store timezone,
  per-store iteration, and evidence thresholds. Label fallback values as
  defaults, not learned recommendations.
- Suggested minimum labels: customer-level after roughly 10 relevant events,
  store-level after roughly 30; validate thresholds with real data before using
  them as claims.
- Scope subject/content experiments to email campaigns and approved automations.
- Require merchant approval before an evaluated winner changes future content.
- Capture tone/content variants now, but do not claim tone learning until an
  outcome-to-selection feedback loop exists and is evaluated.

Exit gate:

- Every “learned,” “incremental,” or “saved margin” statement has a traceable
  calculation, minimum evidence rule, uncertainty/fallback label, and test.

### Stage 7 — operations and submission

Objective: be supportable after Shopify discovery begins.

Engineering/operations:

- Separate staging and production Shopify apps, databases, Redis, provider
  accounts, and secrets.
- Enable PostgreSQL point-in-time recovery and complete a restore drill.
- Configure Redis persistence, dead-letter handling, retry/replay controls, and
  queue autoscaling.
- Alert on queue depth, failed jobs, provider errors, complaint/bounce rates,
  database saturation, disk, API errors, and AI/provider spend.
- Add correlation IDs across API, queue, provider, webhook, and decision rows.
- Publish incident, kill-switch, restore, credential-rotation, and merchant
  communication runbooks.
- Rotate Shopify, Clerk, Resend, AI, database, and Redis credentials before the
  first external merchant.
- Set production encryption/signing secrets according to
  `docs/production-security-configuration.md`.

Submission gate:

- Stages 1–5 complete.
- Stage 6 claims used in listing/demo complete; unfinished claims removed.
- Production runbook exercised by someone other than the author where possible.
- Shopify review pack complete and free plan configured.

## 5. Controlled public rollout

The listing should be fully visible, with capacity controlled in-product rather
than by hiding the listing.

Rollout ladder:

1. Staff-only allowlist.
2. One design partner, smallest approved audience.
3. Three to five hands-on partners.
4. New installers enter a clear onboarding-capacity queue until activated.
5. Expand only after 30 consecutive clean days, at least 20 successful approved
   campaigns/journeys, zero duplicate sends, zero stale-approval sends, and zero
   out-of-boundary sends.

The waitlist must still give Shopify reviewers and every installer a coherent,
truthful experience; it cannot be a broken or empty app shell.

## 6. GTM plan

### Narrative phase — now until reliable partner proof

Publish the idea, not a coordinated product launch.

- Founder story: retention weakened when founder-written customer communication
  stopped, revealing that more automation is not the same as better decisions.
- Publish Ankita, Rohan, Meera, and Kavya as separate decision-ledger stories.
- Test the margin-restraint, list-health, and causal-proof angles independently.
- Recruit three to five design partners from the people who engage with the
  problem.
- Record which language earns qualified merchant conversations, not only views.

No fabricated customers, logos, metrics, testimonials, or lift claims.

### Magic-moment asset

Build and record this exact sequence:

1. Merchant asks: “Create a 30% discount campaign for my top 20 customers.”
2. Joon creates the frozen segment, real Shopify discount, and branded email.
3. Before approval, Joon explains who it recommends holding out and the margin
   at risk, with inspectable evidence.
4. Merchant approves the exact version.
5. Later, the result shows treatment versus deliberately silent control and
   what each group did.

The 60–90 second video begins with the refusal/recommendation result in the
first five seconds, works without sound, and covers one outcome rather than a
dashboard tour. Produce 5-second, 30-second, and 90-second cuts from the same
footage.

### Proof launch — only after real results

Compress attention into one launch day:

- Founder and close supporters establish the story.
- D2C founders and niche Shopify/lifecycle experts add buyer relevance.
- Shopify agencies/ecosystem partners add distribution trust.
- Design partners add real, permissioned proof.
- Indian commerce/startup creators add reach.
- Smaller accounts and communities create repetition.

Give everyone the same central claim, demo, verified facts, and optional angles;
never identical scripts. Release in waves rather than one synchronized minute.

### Earned second wave

After real outcomes exist, add a one-click share card:

> “Here is the customer/cohort Joon told us not to discount—and what happened.”

The card must aggregate or anonymize customer data by default, show the
measurement window and sample size, avoid causal certainty when underpowered,
and require merchant confirmation before sharing.

## 7. Immediate work order

Critical path:

1. Stage 1: embedded App Bridge, Shopify ID tokens, Shopify-origin install.
2. Stage 2: scope decision, protected-data evidence, legal/support, listing pack.
3. Stage 7: submit when the applicable gates pass.

Parallel send-readiness track:

1. Stage 3: canonical audience resolver, dry run, and margin-risk surface.
2. Stage 4: sending-domain workflow and distributed caps.
3. Stage 5: failure drills and six journey validations.
4. Stage 6: learning-loop truthfulness.

Founder-owned actions can begin immediately while engineering builds Stage 1:

- Create/link the production and staging Shopify apps.
- Configure production/staging URLs and resolve Dashboard scopes.
- Start the Level 2 protected-customer-data request.
- Establish legal/support owners and public domains.
- Select the production email provider/account and sender-verification model.
- Rotate provider credentials when the new environments are ready.
- Begin design-partner recruitment through the narrative phase.

## 8. Definition of launch-ready

Joon is launch-ready when a previously unknown merchant can install from
Shopify, authenticate inside Admin, understand the email-only promise, connect
and sync safely, verify a sender, generate or build a campaign/journey, inspect
the audience and holdout, approve an immutable version, send exactly once, see
treatment/control outcomes, unsubscribe successfully, obtain support, and
uninstall with required data handling—without founder intervention for a normal
happy path.

Anything short of that may be a design-partner build, but it is not the public
App Store launch.
