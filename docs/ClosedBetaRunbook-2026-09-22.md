# Closed beta — deployment and manual test runbook

_Companion to `ClosedBetaDeployment-2026-09-21.md`, which holds the activation
order and the environment reference. This one is the sequence to actually
follow, and what to look for at each step._

**Scope.** Closed beta only: who gets in, and what an uninvited person cannot
reach. **Email Studio, campaign delivery, open and click tracking, sender
domains and every other email-content test are deliberately out of scope** and
belong to the studio and delivery passes. Nothing in this runbook sends an
email or touches sending configuration.

---

## Part 0 — What is already true, and what is blocked

| | |
| --- | --- |
| Code merged to `main` | `5e7ca24`, PR #28 |
| Migrations included | `20260921140000_add_invitations`, `20260921180000_add_access_requests` |
| Behaviour change on deploy | **None.** `INVITE_ONLY_MODE` defaults off; both tables are inert until used |

**One prerequisite is genuinely missing and only you can supply it: your Clerk
user id.** `PLATFORM_ADMIN_CLERK_IDS` takes Clerk ids, not email addresses, and
guessing one would either do nothing or name the wrong person. Setting
`INVITE_ONLY_MODE=true` without it closes the door with nobody able to issue an
invitation.

I have not deployed, run a migration, or set a variable on production. Railway
service management is gated in this environment, and the missing id above means
the activation sequence could not be completed correctly even if it were not.

---

## Part 1 — Deployment

Do these in order. Steps 1–3 change no behaviour.

**1. Apply the migrations** through the normal deployed path — whatever runs
`prisma migrate deploy` against the production database on release. Two new
tables, no change to any existing one.

Confirm afterwards: `invitations` and `access_requests` exist, and every other
table is untouched.

**2. Deploy the matching revisions** of **web**, **API** and **workers**, all
from `5e7ca24` or later. They must match: the API enforces the gate, the web
service renders the explanation and reads `INVITE_ONLY_MODE` for the sign-up
page, and the workers share the schema.

**3. Confirm nothing changed.** Sign in as yourself. The app behaves exactly as
before — no invitation screen, no gated routes. `INVITE_ONLY_MODE` is not set,
so closed beta is off.

**4. Set `PLATFORM_ADMIN_CLERK_IDS`** on the **API service** to your Clerk user
id, and redeploy the API. Find the id in the Clerk dashboard under Users; it
looks like `user_2abc...`.

Confirm: `invitations.accessState` returns `isPlatformAdmin: true` for you.

**5. Run Parts 2, 3 and 4 of the manual tests below — while closed beta is
still off.** A failure here is a bug to fix, not an outage.

**6. Set `INVITE_ONLY_MODE=true`** on the **API and the web service**, redeploy
both. The API enforces; the web service explains. Setting it on only one leaves
the app half-gated.

**7. Run Part 5.**

**Clerk stays public** unless you decide otherwise. An uninvited sign-up may
create a Clerk identity — that is expected and harmless: it gets **no
workspace, membership, store, agent chat, model usage, provider send or
billable work**, because none of those exist without a workspace. The
restricted alternative is documented in `ClosedBetaDeployment` § 3 and costs one
manual allowlist step per invitation.

**Do not** send campaign email, create campaign recipients, or change
sending-provider configuration anywhere in this runbook.

---

## Part 2 — Public request flow

_Closed beta still off._

| # | Do | Expect |
| --- | --- | --- |
| 2.1 | Open the landing page, signed out | Every call to action reads **"Request an invite"**. There are three: top nav, hero, closing section. None says "Start free" |
| 2.2 | Click one | `/request-invite`, with name, work email, company, website, platform, customer range and an optional note |
| 2.3 | Submit with a real address you control | *"Thanks—we're opening Joon with a small number of design partners. We'll review your request and be in touch."* |
| 2.4 | Submit the **same address** again, with a different company name | **Identical wording.** Not "you already applied", not an error |
| 2.5 | Submit using an address that **already has a Joon account** | **Identical wording again.** This is the enumeration check: the page must not reveal that an address is known |

**2.6 — Confirm it created only an access request.** In the database, for that
email:

```sql
SELECT count(*) FROM access_requests WHERE email = '<address>';   -- 1
SELECT count(*) FROM users           WHERE email = '<address>';   -- 0
SELECT count(*) FROM workspaces      WHERE name  = '<company>';   -- 0
SELECT count(*) FROM invitations     WHERE email = '<address>';   -- 0
```

Also confirm no new store, campaign, message log, agent chat or generated
content appeared, and that nothing was sent. Step 2.4 should have **updated**
the single row rather than adding a second.

---

## Part 3 — Platform-admin review

| # | Do | Expect |
| --- | --- | --- |
| 3.1 | Signed out, open `/admin/access-requests` | Sign-in, not the console |
| 3.2 | Sign in as a **non-admin** member and open it | "Nothing here." The underlying queries answer `NOT_FOUND`, not "forbidden" — there is no reason to confirm the surface exists |
| 3.3 | Sign in as the platform admin | The console, with your test request listed as `pending` |
| 3.4 | **Mark reviewed** on it | Status becomes `reviewed`; the reviewer and time are recorded |
| 3.5 | **Approve & create invite** — role `owner`, workspace name prefilled from the company | An invitation appears with a **copy button**, and the request becomes `invited` |
| 3.6 | Copy the link, then reload the page | **The link is gone and cannot be retrieved.** Only its hash was stored. To get another, revoke and reissue |
| 3.7 | Check the audit trail | The request records which invitation came from it, who approved it and when |

**3.8 — Revocation.** Issue a second invitation to a throwaway address, revoke
it, and keep the link for step 4.5.

---

## Part 4 — Invitation acceptance

_Use the link from 3.5. Still with closed beta off._

| # | Do | Expect |
| --- | --- | --- |
| 4.1 | Open the link **signed out** | The invitation page, offering **Sign in** and **Create an account**. Nothing is redeemed yet |
| 4.2 | Sign in, or create an account, **with the invited address** | You return to the invitation page — the token survives authentication |
| 4.3 | Accept | You land in the workspace, as **owner** |
| 4.4 | Open the same link again | Refused: *"That invitation can't be used."* One invitation, one acceptance |
| 4.5 | Open the **revoked** link from 3.8, signed in as its intended address | **The same refusal wording** |
| 4.6 | Sign in as a **different** identity and open the link from 3.5 | **The same refusal wording.** A forwarded invitation does not transfer |
| 4.7 | Open `/invite/not-a-real-token` | The same refusal. No stack trace, no hint that the token was malformed rather than wrong |

Every refusal in 4.4 to 4.7 must read identically. A different message for
"expired" than for "not yours" tells a token holder something about the person
it was for.

**Expiry (4.8)** is not practical to test by waiting fourteen days. It is
covered by an automated test that sets the expiry in the past. If you want to
see it by hand, set an invitation's `expiresAt` to a past timestamp directly in
the database and open its link.

---

## Part 5 — Invite-only enforcement

_Only after `INVITE_ONLY_MODE=true` is set on both services._

| # | Do | Expect |
| --- | --- | --- |
| 5.1 | Sign in as **yourself** | Everything as before. Existing members are unaffected |
| 5.2 | Sign in as the design partner from Part 4 | Their workspace, as owner |
| 5.3 | Create a **fresh** Clerk account with an uninvited address | The account may be created — Clerk is public. But in Joon: *"Joon is currently available by invitation."* |
| 5.4 | As that uninvited identity, check the database | **No workspace, no membership** was created for them |
| 5.5 | As that identity, call a workspace API directly — browser devtools or `curl` with their token | **`FORBIDDEN`.** This is the one that matters: the screen is an explanation, the server is the gate |
| 5.6 | As that identity, try deep links: `/campaigns`, `/agent`, `/integrations`, `/settings` | The invitation screen. No campaign, agent chat, store connection, generation, billing or delivery is reachable |
| 5.7 | Open `/sign-up` directly | *"Joon is currently available by invitation."* No sign-up form |
| 5.8 | Confirm no cost was incurred | No agent chat, no generated content, no token usage, no message log for that identity |

**5.9 — Shopify handoff.** If you have a test shop already installed: a Shopify
staff member who is not the installer resolves to the **`pending`** role, which
is denied every workspace capability. Handoff links an identity to an
**existing** store with a single-use bound token; it cannot create a new tenant.
A **new** App Store install during closed beta is refused outright.

---

## Part 6 — Non-member public paths

_These must keep working. None is gated, because none creates a tenant and each
authenticates by signature or token rather than identity._

| Path | Check | Note |
| --- | --- | --- |
| Landing page | Loads signed out | Public site is untouched by closed beta |
| `/sign-in` | Loads, and existing members can sign in | Never gated |
| `/request-invite` | Loads and accepts a submission | Part 2 |
| `/unsubscribe` | Reachable | **Do not** generate a real unsubscribe by sending something |
| `/webhooks/shopify` | Existing store events still arrive | Verify from Shopify's webhook delivery log, not by sending |
| `/webhooks/resend`, `/twilio`, `/gupshup` | Endpoints reachable | Signature-authenticated. Do not fire real provider tests |
| `/v1/*` widget API | Widget still loads on a test storefront | Token-authenticated |
| `/api/public/forms/*`, `/api/public/landing-events` | A form submission still records | Public by design |

**Do not fire real Shopify or Resend sending tests.** Read delivery logs
instead.

---

## Part 7 — Rollback

**One variable.** Set `INVITE_ONLY_MODE=false`, or remove it, on the API and
web services, and redeploy. It takes effect on the next request.

**Verify the rollback:**
1. Sign in with the uninvited identity from 5.3.
2. They now get a workspace and reach the dashboard normally.
3. `/sign-up` renders the Clerk form again.

**Nothing is lost either way.** Invitations already accepted stay accepted,
because acceptance creates an ordinary workspace membership and no membership
depends on closed beta. Turning it back on re-gates only people who are not
members.

**What rollback does not undo:** the two new tables stay (inert when the mode is
off), and the merchant-agent endpoint stays authenticated. That endpoint
previously accepted unauthenticated requests, and restoring that is not
something a rollback should do.

**Do not roll back** unless the manual tests expose a problem.

---

## What each part is for

- **Part 2** proves the public form is not an account oracle and not a
  provisioning path.
- **Part 3** proves only an operator can let someone in.
- **Part 4** proves an invitation is single-use and belongs to one address.
- **Part 5** proves the gate is the server, not the screen.
- **Part 6** proves closed beta did not break the things that must keep working.
- **Part 7** proves you can undo it in one move.
