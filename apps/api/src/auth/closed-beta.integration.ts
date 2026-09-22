import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Closed beta against a real database.
 *
 * Proves the three ways in, every way an invitation stops working, and that
 * the token is not recoverable from what is stored.
 *
 * Disposable Postgres only. No Clerk account is involved: acceptance takes the
 * verified addresses as an argument, which is why it is a function rather than
 * something buried in a resolver.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const beta = await import("./closed-beta");
  return { prisma, ...beta };
}

function withInviteOnly<T>(body: () => Promise<T>): Promise<T> {
  const previousMode = process.env["INVITE_ONLY_MODE"];
  process.env["INVITE_ONLY_MODE"] = "true";
  return body().finally(() => {
    if (previousMode === undefined) delete process.env["INVITE_ONLY_MODE"];
    else process.env["INVITE_ONLY_MODE"] = previousMode;
  });
}

async function seedWorkspace(prisma: any) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 6)}`;
  const workspace = await prisma.workspace.create({
    data: { name: `Beta ${suffix}`, slug: `beta-${suffix}` },
  });
  return { workspaceId: workspace.id, suffix };
}

test("an existing workspace member keeps working", { skip }, async () => {
  const { prisma, closedBetaVerdict } = await load();
  const { workspaceId, suffix } = await seedWorkspace(prisma);
  try {
    const user = await prisma.user.create({
      data: {
        clerkId: `user_member_${suffix}`,
        email: `member-${suffix}@example.test`,
        workspaceMembers: { create: { workspaceId, role: "admin" } },
      },
    });
    await withInviteOnly(async () => {
      const verdict = await closedBetaVerdict({ clerkUserId: user.clerkId });
      assert.equal(verdict.allowed, true);
      assert.equal(verdict.reason, "existing_member");
    });
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
});

test("someone with no membership and no invitation is refused", { skip }, async () => {
  const { closedBetaVerdict } = await load();
  await withInviteOnly(async () => {
    const verdict = await closedBetaVerdict({ clerkUserId: `user_nobody_${randomUUID()}` });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.reason, "no_invitation");
  });
});

test("an unaccepted invitation is not access on its own", { skip }, async () => {
  const { prisma, closedBetaVerdict, createInvitationToken, hashInvitationToken } = await load();
  const { workspaceId, suffix } = await seedWorkspace(prisma);
  try {
    const clerkUserId = `user_invited_${suffix}`;
    await prisma.invitation.create({
      data: {
        email: `invited-${suffix}@example.test`,
        workspaceId,
        role: "admin",
        tokenHash: hashInvitationToken(createInvitationToken()),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByClerkId: "user_operator",
      },
    });
    await withInviteOnly(async () => {
      // Holding an invitation is a right to join once accepted. Until then the
      // answer is no, or acceptance could be skipped and with it the email
      // match and the single-use latch.
      const verdict = await closedBetaVerdict({ clerkUserId });
      assert.equal(verdict.allowed, false);
    });
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
});

test("a platform admin is allowed, and only by environment", { skip }, async () => {
  const { closedBetaVerdict } = await load();
  const clerkUserId = `user_operator_${randomUUID().slice(0, 8)}`;
  const previous = process.env["PLATFORM_ADMIN_CLERK_IDS"];
  try {
    process.env["PLATFORM_ADMIN_CLERK_IDS"] = clerkUserId;
    await withInviteOnly(async () => {
      const verdict = await closedBetaVerdict({ clerkUserId });
      assert.equal(verdict.allowed, true);
      assert.equal(verdict.reason, "platform_admin");
    });
    delete process.env["PLATFORM_ADMIN_CLERK_IDS"];
    await withInviteOnly(async () => {
      assert.equal((await closedBetaVerdict({ clerkUserId })).allowed, false);
    });
  } finally {
    if (previous === undefined) delete process.env["PLATFORM_ADMIN_CLERK_IDS"];
    else process.env["PLATFORM_ADMIN_CLERK_IDS"] = previous;
  }
});

test("with invite-only off, nobody is held", { skip }, async () => {
  const { closedBetaVerdict } = await load();
  const previous = process.env["INVITE_ONLY_MODE"];
  delete process.env["INVITE_ONLY_MODE"];
  try {
    const verdict = await closedBetaVerdict({ clerkUserId: `user_open_${randomUUID()}` });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.reason, "open");
  } finally {
    if (previous !== undefined) process.env["INVITE_ONLY_MODE"] = previous;
  }
});

test("a valid invitation accepts exactly once, and the second attempt fails", { skip }, async () => {
  const { prisma, acceptInvitation, closedBetaVerdict, createInvitationToken, hashInvitationToken } =
    await load();
  const { workspaceId, suffix } = await seedWorkspace(prisma);
  try {
    const email = `accepts-${suffix}@example.test`;
    const clerkUserId = `user_accepts_${suffix}`;
    const token = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email,
        workspaceId,
        role: "admin",
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByClerkId: "user_operator",
      },
    });

    const first = await acceptInvitation({ token, clerkUserId, verifiedEmails: [email] });
    assert.equal(first.accepted, true);
    assert.equal(first.accepted && first.workspaceId, workspaceId);

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { clerkId: clerkUserId } },
      select: { role: true },
    });
    assert.equal(membership?.role, "admin", "acceptance must grant the intended role");

    // And the gate now lets them through, because they are a member.
    await withInviteOnly(async () => {
      assert.equal((await closedBetaVerdict({ clerkUserId })).allowed, true);
    });

    const second = await acceptInvitation({ token, clerkUserId, verifiedEmails: [email] });
    assert.equal(second.accepted, false);
    assert.equal(second.accepted === false && second.refusal, "already_used");

    const accepted = await prisma.invitation.findFirst({ where: { workspaceId } });
    assert.ok(accepted?.acceptedAt, "acceptance must be recorded");
    assert.ok(accepted?.acceptedByUserId, "the accepting user must be recorded");
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
});

test("expired, revoked, wrong-email and unknown invitations are all refused", { skip }, async () => {
  const { prisma, acceptInvitation, createInvitationToken, hashInvitationToken } = await load();
  const { workspaceId, suffix } = await seedWorkspace(prisma);
  try {
    const cases: Array<{ name: string; refusal: string; token: string; emails: string[] }> = [];

    const expiredToken = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email: `expired-${suffix}@example.test`,
        workspaceId,
        tokenHash: hashInvitationToken(expiredToken),
        expiresAt: new Date(Date.now() - 1_000),
        invitedByClerkId: "user_operator",
      },
    });
    cases.push({
      name: "expired",
      refusal: "expired",
      token: expiredToken,
      emails: [`expired-${suffix}@example.test`],
    });

    const revokedToken = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email: `revoked-${suffix}@example.test`,
        workspaceId,
        tokenHash: hashInvitationToken(revokedToken),
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
        revokedByClerkId: "user_operator",
        invitedByClerkId: "user_operator",
      },
    });
    cases.push({
      name: "revoked",
      refusal: "revoked",
      token: revokedToken,
      emails: [`revoked-${suffix}@example.test`],
    });

    const forwardedToken = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email: `intended-${suffix}@example.test`,
        workspaceId,
        tokenHash: hashInvitationToken(forwardedToken),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByClerkId: "user_operator",
      },
    });
    cases.push({
      name: "forwarded to someone else",
      refusal: "email_mismatch",
      token: forwardedToken,
      emails: [`someone-else-${suffix}@example.test`],
    });
    cases.push({
      name: "a token nobody issued",
      refusal: "unknown_token",
      token: createInvitationToken(),
      emails: [`intended-${suffix}@example.test`],
    });

    for (const scenario of cases) {
      const outcome = await acceptInvitation({
        token: scenario.token,
        clerkUserId: `user_${scenario.name.replace(/\W+/g, "_")}_${suffix}`,
        verifiedEmails: scenario.emails,
      });
      assert.equal(outcome.accepted, false, `${scenario.name} must be refused`);
      assert.equal(
        outcome.accepted === false && outcome.refusal,
        scenario.refusal,
        `${scenario.name} refusal reason`
      );
    }

    // None of them created a membership.
    assert.equal(
      await prisma.workspaceMember.count({ where: { workspaceId } }),
      0,
      "a refused invitation must never grant membership"
    );
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
});

test("an unverified address cannot accept, even if it is the right one", { skip }, async () => {
  const { prisma, acceptInvitation, createInvitationToken, hashInvitationToken } = await load();
  const { workspaceId, suffix } = await seedWorkspace(prisma);
  try {
    const email = `unverified-${suffix}@example.test`;
    const token = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email,
        workspaceId,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByClerkId: "user_operator",
      },
    });
    // The caller passes only VERIFIED addresses. An account that merely claims
    // this address contributes nothing to the list, so it cannot match.
    const outcome = await acceptInvitation({
      token,
      clerkUserId: `user_unverified_${suffix}`,
      verifiedEmails: [],
    });
    assert.equal(outcome.accepted, false);
    assert.equal(outcome.accepted === false && outcome.refusal, "email_mismatch");
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
});

test("the token is not recoverable from anything stored", { skip }, async () => {
  const { prisma, createInvitationToken, hashInvitationToken } = await load();
  const { workspaceId, suffix } = await seedWorkspace(prisma);
  try {
    const token = createInvitationToken();
    await prisma.invitation.create({
      data: {
        email: `stored-${suffix}@example.test`,
        workspaceId,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByClerkId: "user_operator",
      },
    });
    // Every column, as text. If the token appears anywhere in the row, a
    // database read reconstructs a working link.
    const rows = await prisma.$queryRawUnsafe<Array<{ dump: string }>>(
      `SELECT invitations::text AS dump FROM invitations WHERE "workspaceId" = '${workspaceId}'`
    );
    assert.equal(rows.length, 1);
    assert.equal(
      rows[0]!.dump.includes(token),
      false,
      "the plaintext token must not appear in the stored row"
    );
    assert.ok(rows[0]!.dump.includes(hashInvitationToken(token)), "the hash is what is stored");
  } finally {
    await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
});
