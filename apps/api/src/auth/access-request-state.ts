/**
 * What may be done to an access request, and from where.
 *
 * A pure module, so the rules can be checked without a database and the same
 * table drives both the server's enforcement and the buttons the operator
 * sees. The UI asking for the allowed actions rather than deciding them itself
 * is what stops the two drifting apart — and disabling a button was never
 * enforcement anyway.
 */

export const ACCESS_REQUEST_STATUSES = ["pending", "reviewed", "invited", "declined"] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

export const ACCESS_REQUEST_ACTIONS = [
  "mark_reviewed",
  "approve",
  "decline",
  "reopen",
  "revoke_invitation",
] as const;
export type AccessRequestAction = (typeof ACCESS_REQUEST_ACTIONS)[number];

/**
 * The live state of the invitation an approved request produced, where there
 * is one. An approved request whose invitation was revoked is not the same
 * situation as one whose invitation is waiting to be accepted, and the
 * operator needs different actions in each.
 */
export type InvitationState = "none" | "live" | "accepted" | "revoked" | "expired";

interface Transition {
  from: AccessRequestStatus;
  to: AccessRequestStatus;
  /** Only offered when the linked invitation is in one of these states. */
  whenInvitation?: readonly InvitationState[];
}

/**
 * Every legal move. Anything not here is refused by the server, whatever the
 * client sent.
 */
const TRANSITIONS: Record<AccessRequestAction, readonly Transition[]> = {
  mark_reviewed: [{ from: "pending", to: "reviewed" }],
  approve: [
    { from: "pending", to: "invited" },
    { from: "reviewed", to: "invited" },
    // Re-approving an already-approved request is allowed only when its
    // invitation can no longer be used. Otherwise a second live invitation
    // would exist for the same person, and revoking one would not close the
    // door.
    { from: "invited", to: "invited", whenInvitation: ["revoked", "expired"] },
  ],
  decline: [
    { from: "pending", to: "declined" },
    { from: "reviewed", to: "declined" },
  ],
  // Deliberate, and only from declined. Reopening returns the request to the
  // reviewed state rather than to pending: it has been looked at, and
  // pretending otherwise would lose that.
  reopen: [{ from: "declined", to: "reviewed" }],
  revoke_invitation: [{ from: "invited", to: "invited", whenInvitation: ["live"] }],
};

export interface RequestState {
  status: AccessRequestStatus;
  invitation: InvitationState;
}

/** Is this move legal from where the request actually is? */
export function canTransition(state: RequestState, action: AccessRequestAction): boolean {
  return TRANSITIONS[action].some(
    (transition) =>
      transition.from === state.status &&
      (!transition.whenInvitation || transition.whenInvitation.includes(state.invitation))
  );
}

/** Where the request lands. Throws for a move that is not legal. */
export function nextStatus(
  state: RequestState,
  action: AccessRequestAction
): AccessRequestStatus {
  const transition = TRANSITIONS[action].find(
    (candidate) =>
      candidate.from === state.status &&
      (!candidate.whenInvitation || candidate.whenInvitation.includes(state.invitation))
  );
  if (!transition) {
    throw new Error(`${action} is not allowed from ${state.status}/${state.invitation}`);
  }
  return transition.to;
}

/** Everything the operator may do right now. The UI renders exactly this. */
export function allowedActions(state: RequestState): AccessRequestAction[] {
  return ACCESS_REQUEST_ACTIONS.filter((action) => canTransition(state, action));
}

/**
 * Why a request is where it is, in the operator's language.
 *
 * Returned by the server so the explanation and the available actions cannot
 * disagree — a row saying "waiting on you" with no actions, or "invited" with
 * an approve button, is how an operator stops trusting the screen.
 */
export function stateSummary(state: RequestState): string {
  if (state.status === "pending") return "Waiting on you.";
  if (state.status === "reviewed") return "Reviewed, no decision yet.";
  if (state.status === "declined") return "Declined. Reopen it if that was wrong.";
  switch (state.invitation) {
    case "accepted":
      return "Invitation accepted. They are in the workspace.";
    case "revoked":
      return "Invitation revoked. Issue a new one if they should still join.";
    case "expired":
      return "Invitation expired unused. Issue a new one if they should still join.";
    case "live":
      return "Invited. The link is waiting to be used.";
    default:
      // Approved, but the invitation behind it cannot be found. Worth saying
      // rather than rendering an empty row.
      return "Approved, but the invitation is missing. Issue a new one.";
  }
}

/** The invitation's live state, from its stored row. */
export function invitationStateOf(
  invitation:
    | { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }
    | null
    | undefined,
  now: Date = new Date()
): InvitationState {
  if (!invitation) return "none";
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "live";
}
