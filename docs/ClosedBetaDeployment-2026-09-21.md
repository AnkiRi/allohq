# Closed beta — deployment checklist

_For a human to run. Every step is a deliberate act; none of it happens by
deploying the code._

The gate is **server-side**: under `INVITE_ONLY_MODE=true`, nobody outside the
three allowed groups is given a workspace, and without a workspace every
workspace procedure refuses before a resolver runs. Clerk settings and the
sign-up page are presentation. Both matter, neither is the control.

> **Deploying this code changes nothing.** `INVITE_ONLY_MODE` defaults to off,
> which makes the deploy safe on its own. Closed beta becomes real only when
> that variable is set to `true` in the deployed **API and web** environments
> and a first platform admin is configured. Until then Joon behaves exactly as
> it does today.

---

## 0. Activation order — follow this exactly

Each step exists so the next one cannot lock you out. **Do not reorder them,
and do not do step 5 early.**

| # | Do | Before moving on, confirm |
| --- | --- | --- |
| 1 | **Deploy the code**, with `INVITE_ONLY_MODE` unset or `false` | The app behaves exactly as before. Nothing is gated yet |
| 2 | **Configure the first platform admin** — set `PLATFORM_ADMIN_CLERK_IDS` to your own Clerk user id on the API, and redeploy the API | `invitations.accessState` returns `isPlatformAdmin: true` for you |
| 3 | **Verify your own sign-in still works** | You can sign in and reach your dashboard as usual. **This is the step that proves you will not be locked out** |
| 4 | **Create and test one invitation end to end** — issue it to an address you control, open the link, accept it, land in the workspace | An invitation you created actually works **while the gate is still off**, so a failure here is not also an outage |
| 5 | **Set `INVITE_ONLY_MODE=true`** on the **API and the web service**, and redeploy both | Both services restarted with the variable set. Setting it on only one leaves the app half-gated: the API is what enforces it, the web service is what explains it |
| 6 | **Verify an uninvited person is blocked** — sign in with an account that has no membership | They see "Joon is currently available by invitation.", not an error. Then confirm a direct API call from that account returns `FORBIDDEN` — the screen is not the gate |
| 7 | **Keep the one-variable rollback available** | You know where `INVITE_ONLY_MODE` is set and that removing it reopens the app on the next request. Nothing else needs undoing |

If step 3 or step 4 does not behave as described, **stop and fix it before step
5.** Everything up to that point is reversible by doing nothing.

---

## 1. Environment variables

Set on the **API** service (`apps/api`) and the **web** service (`apps/web`).

| Variable | Where | Value | What happens without it |
| --- | --- | --- | --- |
| `INVITE_ONLY_MODE` | API **and** web | `true` | Closed beta is **off**. Anyone who signs up gets a workspace, exactly as today. The default is off deliberately: a missing variable must not close the app to everyone by accident. |
| `PLATFORM_ADMIN_CLERK_IDS` | API | comma-separated Clerk user ids | **Nobody can issue an invitation.** The invitation surface returns `NOT_FOUND` to everyone, including you. |

Only the literal string `true` (any case, surrounding spaces ignored) turns the
gate on. `1`, `yes` and `on` do **not** — a typo that silently closed the app
would be its own outage.

**Clerk user ids, not email addresses.** An address can be changed at the
identity provider; matching on one would make "who is an operator" depend on a
field the operator controls. No personal address appears anywhere in source.

---

## 2. Bootstrap the first platform admin

1. Sign in to Joon normally with the account you want to operate from.
2. Find its Clerk user id — Clerk dashboard → **Users** → the user → the `user_…`
   id at the top. (Or read it from an API log line: every audit record carries
   `userId`.)
3. Set `PLATFORM_ADMIN_CLERK_IDS=user_xxxxxxxxxxxx` on the API service and
   redeploy.
4. Confirm: `invitations.accessState` should return `isPlatformAdmin: true`.

Add more operators by appending ids, comma-separated:
`PLATFORM_ADMIN_CLERK_IDS=user_aaa,user_bbb`.

**This is step 2 of the activation order, and it must come before step 5.**
Turning the gate on with no platform admin configured closes the door with
nobody able to issue invitations. Existing workspace members keep working
either way, so it is recoverable — but it is avoidable.

---

## 3. Clerk dashboard configuration

The app stops rendering the sign-up component under `INVITE_ONLY_MODE`, but
Clerk is a separate system and will still accept sign-ups at its own hosted
pages if you let it.

In the Clerk dashboard, for the **production instance**:

- **User & Authentication → Restrictions → Sign-up mode**: set to
  **Restricted**. This stops Clerk creating new accounts outside your control.
- Leave sign-**in** enabled. Existing members must be able to get back in.

**This is defence in depth, not the gate.** Someone who creates a Clerk account
by any means still gets no workspace, and therefore reaches nothing. Do it
anyway: an account that cannot be created cannot be a loose end.

---

## 4. Turn it on — activation step 5

Only after steps 1 to 4 above have each been confirmed.

1. Set `INVITE_ONLY_MODE=true` on the API **and** the web service.
2. Redeploy both.
3. Check, in this order:
   - the public landing page still loads for a signed-out visitor;
   - an existing member can sign in and reach their dashboard;
   - `/sign-up` shows "Joon is currently available by invitation.";
   - a signed-in account with no membership sees the same sentence in-app, not
     an error.

---

## 5. Create, share and revoke an invitation

**Create** — as a platform admin, call `invitations.create`:

```
{ email: "founder@brand.example", workspaceId: "<workspace>", role: "admin", expiresInDays: 14 }
```

The response contains `token` — **the only time it exists**. Nothing stores it;
only its SHA-256 hash is written, so it cannot be recovered from the database.
Lost it? Revoke and issue another.

**Share** — send them:

```
https://agent.joonhq.com/invite/<token>
```

No email is sent from Joon. That is deliberate: sending would take a dependency
on sender-domain authentication and warm-up work that is not finished, and this
pass does not add an unreviewed delivery dependency. Pass the link on yourself.

**What they do** — open the link, sign in with **the address the invitation was
issued to**, accept. They land in the workspace with the role you chose.
Acceptance requires an address Clerk has **verified**, so forwarding the link to
someone else does not transfer it.

**Revoke** — `invitations.revoke` with the invitation id. An invitation that has
already been accepted cannot be revoked; remove the workspace member instead.

**See the state of everything** — `invitations.list` returns
`invited | accepted | revoked | expired` per invitation. It never returns the
token or its hash.

---

## 6. Manual acceptance

| # | Step | What to confirm |
| --- | --- | --- |
| 1 | Open the landing page signed out | Loads normally. Closed beta does not touch it. |
| 2 | Sign in as an existing member | Dashboard as usual, no invitation screen |
| 3 | Visit `/sign-up` | "Joon is currently available by invitation." No sign-up form |
| 4 | Sign in with an account that has no membership | The same sentence, in-app, calm — not an error page |
| 5 | From that account, call any workspace API directly | `FORBIDDEN`. The screen is not the gate; check this one with the network tab or curl |
| 6 | Create an invitation for an address you control | You get a token exactly once |
| 7 | Open the invite link **signed out** | Sign-in is offered; nothing is redeemed yet |
| 8 | Sign in with a **different** address and accept | Refused, in the same words as every other refusal |
| 9 | Sign in with the **intended** address and accept | You land in the workspace with the role chosen |
| 10 | Open the same link again | Refused. One invitation, one acceptance |
| 11 | Revoke an unaccepted invitation, then open its link | Refused |
| 12 | Check a Shopify webhook still arrives | Webhooks authenticate by signature and are not gated |

---

## 7. Rollback

**To reopen the app:** set `INVITE_ONLY_MODE=false` (or remove it) and redeploy.
That is the whole rollback — one variable, and it takes effect on the next
request.

Nothing is destroyed by turning it off and nothing is lost by turning it back
on. Invitations already accepted stay accepted, because acceptance creates a
normal workspace membership and nothing about a membership depends on closed
beta.

If you also set Clerk's sign-up mode to Restricted, set it back to Public in the
Clerk dashboard — that part is not controlled by the variable.

**What rollback does not undo:** the `invitations` table stays (empty or not;
it is inert when the mode is off), and `/v1/agent/*` stays authenticated. That
endpoint previously accepted unauthenticated requests, and restoring that is not
a rollback anyone should want.
