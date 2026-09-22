import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@allohq/database";

/**
 * Closed beta: who is allowed to exist inside Joon.
 *
 * The gate is at the PROVISIONING boundary, not at the door. Anyone can hold a
 * Clerk session — Clerk is an identity provider, not an authorisation one. What
 * closed beta withholds is a workspace: without one, `workspaceProcedure`
 * refuses every call with FORBIDDEN before a resolver runs, so no model call,
 * no provider send, no campaign, no store connection and no background job can
 * be reached. Hiding a button is not this.
 *
 * Three ways in, and no others:
 *   - you are already a member of a workspace;
 *   - you are a platform admin, named by environment, never by source;
 *   - you accepted an invitation addressed to your verified email.
 */

/** Off unless explicitly turned on, so a missing variable cannot open the app. */
export function isInviteOnlyMode(): boolean {
  return (process.env["INVITE_ONLY_MODE"] ?? "").trim().toLowerCase() === "true";
}

/**
 * Platform admins, as Clerk user ids in `PLATFORM_ADMIN_CLERK_IDS`.
 *
 * Ids rather than email addresses: an address can be changed at the identity
 * provider, and matching on one would make "who is an operator" depend on a
 * field the operator controls. No personal address appears in source.
 */
export function platformAdminClerkIds(): ReadonlySet<string> {
  const raw = process.env["PLATFORM_ADMIN_CLERK_IDS"] ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function isPlatformAdmin(clerkUserId: string | null | undefined): boolean {
  if (!clerkUserId) return false;
  return platformAdminClerkIds().has(clerkUserId);
}

/** 256 bits, url-safe. Returned once and never stored. */
export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compare two hashes without leaking where they diverge. The lookup is by
 * unique index so this is belt and braces, but a token check is exactly the
 * place not to rely on a fast path.
 */
export function invitationTokenMatches(token: string, storedHash: string): boolean {
  const computed = Buffer.from(hashInvitationToken(token), "utf8");
  const stored = Buffer.from(storedHash, "utf8");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

export type ClosedBetaVerdict =
  | { allowed: true; reason: "open" | "existing_member" | "platform_admin" }
  | { allowed: false; reason: "no_invitation" };

/**
 * May this identity hold a workspace?
 *
 * Deliberately does NOT consider pending invitations. An invitation is a right
 * to join once accepted, not access on its own — accepting it is what creates
 * the membership, and until then the answer is no. Treating an unaccepted
 * invitation as access would skip the email match and the single-use latch.
 */
export async function closedBetaVerdict(input: {
  clerkUserId: string;
}): Promise<ClosedBetaVerdict> {
  if (!isInviteOnlyMode()) return { allowed: true, reason: "open" };
  if (isPlatformAdmin(input.clerkUserId)) return { allowed: true, reason: "platform_admin" };

  const membership = await prisma.workspaceMember.findFirst({
    where: { user: { clerkId: input.clerkUserId } },
    select: { id: true },
  });
  if (membership) return { allowed: true, reason: "existing_member" };

  return { allowed: false, reason: "no_invitation" };
}

/**
 * The one sentence an uninvited person sees. Identical for every address:
 * saying "no invitation was found for you" would confirm which addresses have
 * one, which is an enumeration oracle for anyone who can sign up.
 */
export const CLOSED_BETA_MESSAGE = "Joon is currently available by invitation.";

export type InvitationRefusal =
  | "unknown_token"
  | "already_used"
  | "revoked"
  | "expired"
  | "email_mismatch";

export type AcceptInvitationResult =
  | { accepted: true; workspaceId: string; userId: string; role: string }
  | { accepted: false; refusal: InvitationRefusal };

/**
 * Redeem an invitation.
 *
 * Separated from the router so it can be tested without a Clerk account: the
 * caller supplies the verified addresses, and this decides. The router's only
 * job is to fetch them.
 *
 * The refusal reason is returned for logs and tests. It must NOT reach the
 * caller of the API — every refusal looks identical from outside, or a token
 * holder learns whether an address was the intended one.
 */
export async function acceptInvitation(input: {
  token: string;
  clerkUserId: string;
  /** Addresses Clerk has verified for this account, lowercased. */
  verifiedEmails: readonly string[];
  now?: Date;
}): Promise<AcceptInvitationResult> {
  const now = input.now ?? new Date();
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(input.token) },
  });
  if (!invitation) return { accepted: false, refusal: "unknown_token" };
  if (!invitationTokenMatches(input.token, invitation.tokenHash)) {
    return { accepted: false, refusal: "unknown_token" };
  }
  if (invitation.acceptedAt) return { accepted: false, refusal: "already_used" };
  if (invitation.revokedAt) return { accepted: false, refusal: "revoked" };
  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return { accepted: false, refusal: "expired" };
  }

  const intended = invitation.email.trim().toLowerCase();
  const matches = input.verifiedEmails.some(
    (email) => email.trim().toLowerCase() === intended
  );
  // An unverified address is a claim, not a fact. Forwarding the link to
  // someone else must not transfer the invitation.
  if (!matches) return { accepted: false, refusal: "email_mismatch" };

  const result = await prisma.$transaction(async (tx) => {
    // The single-use latch. Conditional on `acceptedAt` still being null, so
    // two simultaneous attempts cannot both succeed — the loser updates zero
    // rows and is refused.
    const latched = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    if (latched.count !== 1) return null;

    const user = await tx.user.upsert({
      where: { clerkId: input.clerkUserId },
      update: { email: intended },
      create: { clerkId: input.clerkUserId, email: intended },
      select: { id: true },
    });
    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id },
      },
      update: {},
      create: {
        workspaceId: invitation.workspaceId,
        userId: user.id,
        role: invitation.role,
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedByUserId: user.id },
    });
    return { userId: user.id };
  });

  if (!result) return { accepted: false, refusal: "already_used" };
  return {
    accepted: true,
    workspaceId: invitation.workspaceId,
    userId: result.userId,
    role: invitation.role,
  };
}
