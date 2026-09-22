# Clerk access mode — audit and proposal

_Read-only audit of the production Clerk instance. **Nothing was changed**: no
dashboard setting, no plan, no access mode, no allowlist, no identity
configuration._

---

## The correction this document exists to make

**Joon does not prevent unapproved people from signing in or signing up. It
prevents them from reaching a workspace after they have authenticated.**

Those are different things, and earlier notes in this repository blurred them.
Anyone can create a Clerk identity today — with an email address or with Google
— and that identity is real. What it cannot do is reach anything: no workspace
is provisioned, so every workspace procedure refuses before a resolver runs.

That is a sound gate. It is not a registration restriction, and it should not
be described as one.

---

## What the production instance actually reports

Queried through the Clerk Backend API using the production secret, which was
never printed.

| Question | Evidence | Answer |
| --- | --- | --- |
| Which instance is production using? | key prefix `sk_live_` | **Live/production**, not a test instance |
| Is the allowlist available? | `GET /v1/allowlist_identifiers` → **HTTP 402** *"Unsupported plan features. Upgrade your subscription to unlock them"* | **No. The current plan does not include it** |
| Is the sign-up mode Open, Restricted or Waitlist? | `GET /v1/instance` does not return the field | **Cannot be determined from the API.** Only the dashboard can answer, and it was not opened |
| Are Clerk's own invitations usable? | `GET /v1/invitations` → **HTTP 200**, `0` outstanding | The API is reachable; **Clerk invitations are not in use at all today** |
| Is the Backend API otherwise reachable? | `GET /v1/users` → **HTTP 200** | Yes |

**The headline finding: the allowlist is a paid feature this account does not
have.** Every previous suggestion in this repository to "set Clerk to Restricted
and allowlist each invited address" rests on a feature that returns 402 today.
That proposal cannot be implemented without a plan change, and saying so is the
point of this audit.

**The sign-up mode is genuinely unknown.** It is not exposed on the endpoint,
and the dashboard was deliberately not touched. It must not be reported as
"Open" on the strength of behaviour alone, because a Restricted instance with
an empty allowlist would look similar from outside.

---

## What happens today, case by case

Behaviour of the deployed code, with `INVITE_ONLY_MODE=true` on both services.

| # | Who | Clerk | Joon |
| --- | --- | --- | --- |
| 1 | Uninvited new email address | Creates an identity, **subject to the unverified sign-up mode** | No user row, no workspace, no membership. Sees *"Joon is currently available by invitation."* Every workspace API returns `FORBIDDEN` |
| 2 | Uninvited Google OAuth | Same as 1 — OAuth is another way to authenticate, not another way in | Same as 1 |
| 3 | Existing Clerk identity, no Joon invitation | Signs in normally | Same as 1. Holding an identity has never been access |
| 4 | Newly invited address, no Clerk account | Creates an identity through the invitation page | Accepts the invitation, joins the intended workspace with the intended role |
| 5 | Existing Clerk identity, newly invited | Signs in normally | Accepts, joins. The verified-email match is what binds the invitation to them |
| 6 | Existing workspace member | Signs in normally | Unaffected. Membership is what the gate looks for |

Cases 1 to 3 all end in an identity that reaches nothing. **That is the current
protection, and it is real** — but it is a Joon-side authorisation gate, not a
Clerk-side registration restriction.

### What this leaves open

- Stray Clerk identities accumulate. They reach nothing, but they exist.
- Anyone can attempt sign-up and see the invitation screen, which confirms Joon
  exists and is in closed beta. That is not a secret.
- No Clerk-side cost or rate limit applies to identity creation.

---

## Proposal: Clerk invitation mirrored from a Joon approval

The flow asked for:

```
admin approves a Joon request
  → a Clerk invitation is created
  → the recipient authenticates through that Clerk invitation
  → the Joon invitation joins them to the right workspace
  → an uninvited identity cannot be created at all
```

**This requires a Clerk plan that includes restricted sign-up.** Without it the
last line cannot hold, whatever the code does. Establishing which plan, and
whether the cost is worth it for a design-partner phase, is a decision for the
account owner and is **not** made here.

### Source of truth

**Joon's invitation stays the source of truth.** It is the one that carries the
workspace, the role, the single-use latch and the audit trail; Clerk's knows
only an address. The Clerk invitation becomes a *derived artefact* whose only
job is to let the right person through the front door.

Concretely: `Invitation` gains a nullable `clerkInvitationId`. Joon never reads
authorisation from it. If the two ever disagree, Joon's wins.

### No-email, copy-link workflow

Clerk sends its own invitation email by default; that must be **disabled**
(`notify: false`), because sending is exactly the dependency this phase is
avoiding. The operator continues to copy the Joon link. Clerk's invitation then
functions purely as permission-to-register for that address.

### Existing Clerk identities

A Clerk invitation cannot be issued for an address that already has an account —
the API rejects it. That is not an error case to suppress: an existing identity
**needs no invitation to sign in**, so the correct behaviour is to skip the
Clerk step and rely on the Joon invitation alone. The approval flow must detect
this and record which path was taken.

### When the Clerk API fails after a Joon approval

The Joon invitation is already created and the operator may already have copied
the link. Three rules:

1. **Never roll back the Joon invitation.** It is valid on its own.
2. **Record the failure on the request's decision trail**, so the gap is
   visible rather than silent.
3. **Surface it in the console** — *"Invitation created. Clerk registration was
   not pre-authorised; they may be unable to sign up."* — with a retry action.

The reverse order (Clerk first, Joon second) is worse: it would leave an address
authorised to register with nothing to join.

### Revoke and expiry

Revoking a Joon invitation must also revoke the Clerk one, or a revoked person
could still create an identity. Expiry needs no synchronisation — Clerk
invitations expire independently and an expired Joon invitation refuses
acceptance regardless. Both directions of drift must resolve in favour of the
stricter answer.

### Audit

Each Clerk interaction appends to the same `AccessRequestDecision` trail already
added for decisions: `clerk_invitation_created`, `clerk_invitation_failed`,
`clerk_invitation_revoked`, with actor, timestamp and the Clerk id. The trail is
append-only, so a failed mirror stays visible after a successful retry.

### Migration and deployment

- One additive migration: `clerkInvitationId` on `Invitation`, nullable.
- No behaviour change on deploy: the mirror is off unless a new
  `CLERK_INVITATION_MIRROR=true` is set.
- The dashboard change to Restricted is **manual, and must come after** the
  mirror is verified — restricting sign-up before invitations are being mirrored
  would lock out every legitimate invitee.

### Tests required before production activation

- A Joon approval creates exactly one Clerk invitation, with `notify: false`.
- An address that already has a Clerk identity skips the Clerk step, and the
  Joon invitation still works.
- A Clerk API failure leaves the Joon invitation valid, records the failure, and
  surfaces a retry.
- Revoking in Joon revokes in Clerk.
- An expired Joon invitation is refused regardless of Clerk's view.
- With the mirror off, behaviour is byte-for-byte what it is today.

---

## Recommendation

**Do not pursue this during the design-partner phase.** It needs a Clerk plan
upgrade for a feature that returns 402 today, in order to prevent stray
identities that already reach nothing. The gate that matters — no invitation, no
workspace — is deployed and enforced.

Revisit when either becomes true: the volume of stray identities is a real cost,
or the fact that anyone can reach a sign-in screen becomes a concern in its own
right.

**What should change regardless**, and costs nothing: stop describing Joon as
preventing registration. It prevents access.
