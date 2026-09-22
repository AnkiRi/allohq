import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCESS_REQUEST_ACTIONS,
  ACCESS_REQUEST_STATUSES,
  allowedActions,
  canTransition,
  invitationStateOf,
  nextStatus,
  stateSummary,
  type AccessRequestAction,
  type InvitationState,
} from "./access-request-state";

/**
 * Every move an operator can make on an access request, and every one they
 * cannot.
 *
 * The bug this replaces: after Decline, Approve or Mark reviewed, every action
 * stayed available. An operator could decline a request twice, or approve one
 * they had already approved, with no finality and no feedback. Disabling the
 * buttons would not have fixed it — the server accepted the repeat either way.
 */

const INVITATION_STATES: InvitationState[] = ["none", "live", "accepted", "revoked", "expired"];

test("a pending request can be reviewed, approved or declined, and nothing else", () => {
  const actions = allowedActions({ status: "pending", invitation: "none" });
  assert.deepEqual(actions.sort(), ["approve", "decline", "mark_reviewed"]);
});

test("a reviewed request can be approved or declined, but not reviewed again", () => {
  const actions = allowedActions({ status: "reviewed", invitation: "none" });
  assert.deepEqual(actions.sort(), ["approve", "decline"]);
  assert.equal(
    canTransition({ status: "reviewed", invitation: "none" }, "mark_reviewed"),
    false,
    "marking a reviewed request as reviewed is the repeat this fixes"
  );
});

test("an invited request offers revoke, and nothing that would decide it again", () => {
  const live = { status: "invited" as const, invitation: "live" as const };
  assert.deepEqual(allowedActions(live), ["revoke_invitation"]);
  for (const action of ["approve", "decline", "mark_reviewed"] as AccessRequestAction[]) {
    assert.equal(canTransition(live, action), false, `${action} must not be offered once invited`);
  }
});

test("a declined request offers exactly one way back, and it is deliberate", () => {
  const declined = { status: "declined" as const, invitation: "none" as const };
  assert.deepEqual(allowedActions(declined), ["reopen"]);
  // Declining twice was possible before and is the clearest symptom of the bug.
  assert.equal(canTransition(declined, "decline"), false, "a declined request cannot be declined again");
  assert.equal(canTransition(declined, "approve"), false, "reopen first, then decide");
  // Reopening returns it to reviewed, not pending: it has been looked at.
  assert.equal(nextStatus(declined, "reopen"), "reviewed");
});

test("a revoked or expired invitation can be replaced, and only replaced", () => {
  for (const invitation of ["revoked", "expired"] as InvitationState[]) {
    const state = { status: "invited" as const, invitation };
    assert.deepEqual(allowedActions(state), ["approve"], `${invitation} should offer a new invitation`);
    assert.equal(nextStatus(state, "approve"), "invited");
    assert.equal(
      canTransition(state, "revoke_invitation"),
      false,
      `there is nothing left to revoke on a ${invitation} invitation`
    );
  }
});

test("an accepted invitation is the end of the road", () => {
  // They are in the workspace. Removing them is a membership action, not an
  // access-request one, so this row offers nothing.
  assert.deepEqual(allowedActions({ status: "invited", invitation: "accepted" }), []);
});

test("a live invitation cannot be replaced without revoking it first", () => {
  // Otherwise two live invitations exist for one person and revoking one does
  // not close the door.
  assert.equal(
    canTransition({ status: "invited", invitation: "live" }, "approve"),
    false
  );
});

test("no state ever offers every action, which is the bug being fixed", () => {
  for (const status of ACCESS_REQUEST_STATUSES) {
    for (const invitation of INVITATION_STATES) {
      const actions = allowedActions({ status, invitation });
      assert.ok(
        actions.length < ACCESS_REQUEST_ACTIONS.length,
        `${status}/${invitation} offered every action`
      );
      // And every offered action must actually be legal from here.
      for (const action of actions) {
        assert.equal(canTransition({ status, invitation }, action), true);
        assert.ok(nextStatus({ status, invitation }, action));
      }
    }
  }
});

test("an illegal move throws rather than guessing a destination", () => {
  assert.throws(
    () => nextStatus({ status: "declined", invitation: "none" }, "approve"),
    /not allowed from declined/
  );
  assert.throws(
    () => nextStatus({ status: "invited", invitation: "accepted" }, "revoke_invitation"),
    /not allowed from invited/
  );
});

test("every state explains itself, and never as an empty string", () => {
  for (const status of ACCESS_REQUEST_STATUSES) {
    for (const invitation of INVITATION_STATES) {
      const summary = stateSummary({ status, invitation });
      assert.ok(summary.length > 0, `${status}/${invitation} had no explanation`);
      assert.match(summary, /\.$/, "an explanation is a sentence");
    }
  }
  assert.match(stateSummary({ status: "invited", invitation: "revoked" }), /revoked/i);
  assert.match(stateSummary({ status: "invited", invitation: "accepted" }), /workspace/i);
});

test("the invitation's live state is read from its row, not assumed", () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 1_000);
  assert.equal(invitationStateOf(null), "none");
  assert.equal(invitationStateOf({ acceptedAt: null, revokedAt: null, expiresAt: future }), "live");
  assert.equal(invitationStateOf({ acceptedAt: new Date(), revokedAt: null, expiresAt: future }), "accepted");
  assert.equal(invitationStateOf({ acceptedAt: null, revokedAt: new Date(), expiresAt: future }), "revoked");
  assert.equal(invitationStateOf({ acceptedAt: null, revokedAt: null, expiresAt: past }), "expired");
  // Accepted wins over expired: it was used in time, and the row should not
  // start claiming otherwise the moment the clock passes.
  assert.equal(
    invitationStateOf({ acceptedAt: new Date(), revokedAt: null, expiresAt: past }),
    "accepted"
  );
});
