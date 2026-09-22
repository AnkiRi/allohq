import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Asking for access, and an operator turning that into an invitation.
 *
 * The important negative is what submitting does NOT do. A public form that
 * quietly created an identity, a tenant or a model call would be the hole
 * closed beta exists to prevent.
 *
 * Disposable Postgres only.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  // Only this router, not the whole tree: importing every router pulls in the
  // agent and model stacks, and a test of a public form should not need them
  // loaded to run.
  const { accessRequestsRouter } = await import("./access-requests");
  const beta = await import("../auth/closed-beta");
  return { prisma, accessRequestsRouter, ...beta };
}

/** A caller with no identity, as the public form has. */
function publicCaller(prisma: any, clientIp: string) {
  return {
    prisma,
    userId: null,
    workspaceId: null,
    isDemo: false,
    authSource: null,
    clientIp,
    closedBeta: false,
  };
}

function adminCaller(prisma: any, clerkUserId: string) {
  return {
    prisma,
    userId: clerkUserId,
    workspaceId: null,
    isDemo: false,
    authSource: "clerk" as const,
    clientIp: "10.0.0.1",
    closedBeta: false,
  };
}

const form = (email: string) => ({
  name: "A Founder",
  email,
  company: "Example Brand",
  website: "example.myshopify.com",
  platform: "shopify" as const,
  customerRange: "10k_100k" as const,
  note: "We send too much email.",
});

test("submitting creates one request and nothing else", { skip }, async () => {
  const { prisma, accessRequestsRouter } = await load();
  // Everything this submission could possibly have created is identifiable
  // from what it was given. Counting whole tables instead would be racy: the
  // integration files share one database and run concurrently, so a workspace
  // another file created mid-test would read as one this form created.
  const marker = randomUUID().slice(0, 8);
  const email = `asks-${marker}@example.test`;
  const company = `Example Brand ${marker}`;

  const caller = accessRequestsRouter.createCaller(
    publicCaller(prisma, `1.2.3.${Math.floor(Math.random() * 250)}`)
  );
  const result = await caller.submit({ ...form(email), company });
  assert.match(result.acknowledged, /small number of design partners/);

  try {
    const created = await prisma.accessRequest.findFirst({ where: { email } });
    assert.ok(created, "the request itself must be recorded");
    assert.equal(created.status, "pending");

    // Nothing else exists that could have come from it. This is the whole
    // point of a public form.
    assert.equal(
      await prisma.user.count({ where: { email } }),
      0,
      "no user may be created for the address that asked"
    );
    assert.equal(
      await prisma.workspace.count({ where: { name: company } }),
      0,
      "no workspace may be created from the company they named"
    );
    assert.equal(
      await prisma.workspaceMember.count({ where: { user: { email } } }),
      0,
      "no membership may be created"
    );
    assert.equal(
      await prisma.invitation.count({ where: { email } }),
      0,
      "submitting must not invite anyone"
    );
    assert.equal(
      await prisma.store.count({ where: { workspace: { name: company } } }),
      0,
      "no store connection"
    );
    assert.equal(
      await prisma.messageLog.count({ where: { workspace: { name: company } } }),
      0,
      "no provider send"
    );
    assert.equal(
      await prisma.aiChat.count({ where: { store: { workspace: { name: company } } } }),
      0,
      "no agent task"
    );
  } finally {
    await prisma.accessRequest.deleteMany({ where: { email } }).catch(() => undefined);
  }
});

test("the honeypot is silently accepted and stores nothing", { skip }, async () => {
  const { prisma, accessRequestsRouter } = await load();
  const email = `bot-${randomUUID().slice(0, 8)}@example.test`;
  const caller = accessRequestsRouter.createCaller(publicCaller(prisma, "9.9.9.9"));
  const result = await caller.submit({
    ...form(email),
    companyWebsiteConfirm: "http://spam.example",
  });
  // Identical wording to a real submission: something filling every field
  // learns nothing from the response.
  assert.match(result.acknowledged, /small number of design partners/);
  assert.equal(
    await prisma.accessRequest.count({ where: { email } }),
    0,
    "a honeypot hit must not be stored"
  );
});

test("a repeat submission updates rather than queueing, and reads the same", { skip }, async () => {
  const { prisma, accessRequestsRouter } = await load();
  const email = `repeat-${randomUUID().slice(0, 8)}@example.test`;
  const ip = `5.5.5.${Math.floor(Math.random() * 250)}`;
  const caller = accessRequestsRouter.createCaller(publicCaller(prisma, ip));
  try {
    const first = await caller.submit(form(email));
    const second = await caller.submit({ ...form(email), company: "Renamed Brand" });
    assert.equal(first.acknowledged, second.acknowledged, "the answer must not vary");
    const rows = await prisma.accessRequest.findMany({ where: { email } });
    assert.equal(rows.length, 1, "one address, one open request");
    assert.equal(rows[0]!.company, "Renamed Brand", "the latest details win");
  } finally {
    await prisma.accessRequest.deleteMany({ where: { email } }).catch(() => undefined);
  }
});

test("rate limiting answers identically rather than refusing", { skip }, async () => {
  const { prisma, accessRequestsRouter } = await load();
  const ip = `7.7.7.${Math.floor(Math.random() * 250)}`;
  const caller = accessRequestsRouter.createCaller(publicCaller(prisma, ip));
  const emails: string[] = [];
  try {
    const answers = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
      const email = `flood-${index}-${randomUUID().slice(0, 6)}@example.test`;
      emails.push(email);
      answers.add((await caller.submit(form(email))).acknowledged);
    }
    assert.equal(answers.size, 1, "a throttled attempt must read like an accepted one");
    const stored = await prisma.accessRequest.count({ where: { email: { in: emails } } });
    // Five per hour per source address: the rest are acknowledged and dropped.
    assert.ok(stored <= 5, `rate limit did not apply: ${stored} stored`);
    assert.ok(stored >= 1, "the first submissions should still land");
  } finally {
    await prisma.accessRequest.deleteMany({ where: { email: { in: emails } } }).catch(() => undefined);
  }
});

test("only a platform admin can read requests or issue an invitation", { skip }, async () => {
  const { prisma, accessRequestsRouter } = await load();
  const previous = process.env["PLATFORM_ADMIN_CLERK_IDS"];
  delete process.env["PLATFORM_ADMIN_CLERK_IDS"];
  try {
    const caller = accessRequestsRouter.createCaller(adminCaller(prisma, "user_not_an_operator"));
    // NOT_FOUND, not FORBIDDEN: there is no reason to confirm the surface exists.
    await assert.rejects(caller.list(), (error: { code?: string }) =>
      error.code === "NOT_FOUND"
    );
    await assert.rejects(
      caller.approveAndInvite({ id: "whatever", newWorkspaceName: "X" }),
      (error: { code?: string }) => error.code === "NOT_FOUND"
    );
    await assert.rejects(
      caller.decide({ id: "whatever", action: "decline" }),
      (error: { code?: string }) => error.code === "NOT_FOUND"
    );
  } finally {
    if (previous === undefined) delete process.env["PLATFORM_ADMIN_CLERK_IDS"];
    else process.env["PLATFORM_ADMIN_CLERK_IDS"] = previous;
  }
});

test("approving a request creates the workspace, the invitation and the audit link", { skip }, async () => {
  const { prisma, accessRequestsRouter, hashInvitationToken, acceptInvitation, closedBetaVerdict } =
    await load();
  const operator = `user_operator_${randomUUID().slice(0, 8)}`;
  const previous = process.env["PLATFORM_ADMIN_CLERK_IDS"];
  process.env["PLATFORM_ADMIN_CLERK_IDS"] = operator;
  const marker = randomUUID().slice(0, 8);
  const email = `healthify-${marker}@example.test`;
  const companyName = `Healthify ${marker}`;
  let workspaceId: string | undefined;
  try {
    // A design partner asks.
    await accessRequestsRouter
      .createCaller(publicCaller(prisma, `8.8.8.${Math.floor(Math.random() * 250)}`))
      .submit({ ...form(email), company: companyName });
    const request = await prisma.accessRequest.findFirstOrThrow({ where: { email } });

    // The operator approves into a brand-new workspace named from the company.
    const issued = await accessRequestsRouter
      .createCaller(adminCaller(prisma, operator))
      .approveAndInvite({ id: request.id, role: "owner" });
    workspaceId = issued.workspaceId;

    assert.equal(issued.email, email, "the invitation is for the address that asked");
    assert.equal(issued.role, "owner", "the first person in is an owner");
    assert.equal(issued.workspaceName, companyName);
    assert.ok(issued.token.length >= 42, "a token comes back exactly once");

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: issued.invitationId } });
    assert.equal(stored.tokenHash, hashInvitationToken(issued.token));
    assert.equal(
      JSON.stringify(stored).includes(issued.token),
      false,
      "the plaintext token must not be stored"
    );

    const after = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(after.status, "invited");
    assert.equal(after.invitationId, issued.invitationId, "the request records its invitation");
    assert.equal(after.reviewedByClerkId, operator);

    // Approving into an EXISTING workspace is the other path, and it must not
    // create a second one.
    const second = await prisma.accessRequest.create({
      data: {
        email: `second-${randomUUID().slice(0, 8)}@example.test`,
        name: "Another Founder",
        company: "Second Brand",
        platform: "shopify",
        customerRange: "under_10k",
      },
    });
    const intoExisting = await accessRequestsRouter
      .createCaller(adminCaller(prisma, operator))
      .approveAndInvite({ id: second.id, role: "admin", workspaceId: issued.workspaceId });
    assert.equal(intoExisting.workspaceId, issued.workspaceId);
    assert.equal(intoExisting.workspaceName, companyName);
    // Scoped rather than a whole-table count: other integration files are
    // writing to this database at the same time.
    assert.equal(
      await prisma.workspace.count({ where: { name: "Second Brand" } }),
      0,
      "joining an existing workspace must not create another"
    );
    await prisma.accessRequest.delete({ where: { id: second.id } }).catch(() => undefined);

    // A second approval of the SAME request is refused rather than issuing a
    // second invitation.
    await assert.rejects(
      accessRequestsRouter
        .createCaller(adminCaller(prisma, operator))
        .approveAndInvite({ id: request.id, newWorkspaceName: "Again" }),
      (error: { code?: string }) => error.code === "CONFLICT"
    );

    // And the whole point: that link, and only the intended address, gets in.
    const wrongPerson = await acceptInvitation({
      token: issued.token,
      clerkUserId: "user_someone_else",
      verifiedEmails: ["someone-else@example.test"],
    });
    assert.equal(wrongPerson.accepted, false, "a forwarded link must not work");

    const intended = await acceptInvitation({
      token: issued.token,
      clerkUserId: `user_healthify_${randomUUID().slice(0, 6)}`,
      verifiedEmails: [email],
    });
    assert.equal(intended.accepted, true);
    assert.equal(intended.accepted && intended.role, "owner");

    const membership = await prisma.workspaceMember.findFirstOrThrow({
      where: { workspaceId: issued.workspaceId },
      include: { user: true },
    });
    assert.equal(membership.role, "owner");

    // Closed beta now lets them through, because they are a member.
    const previousMode = process.env["INVITE_ONLY_MODE"];
    process.env["INVITE_ONLY_MODE"] = "true";
    try {
      const verdict = await closedBetaVerdict({ clerkUserId: membership.user.clerkId });
      assert.equal(verdict.allowed, true);
    } finally {
      if (previousMode === undefined) delete process.env["INVITE_ONLY_MODE"];
      else process.env["INVITE_ONLY_MODE"] = previousMode;
    }
  } finally {
    if (previous === undefined) delete process.env["PLATFORM_ADMIN_CLERK_IDS"];
    else process.env["PLATFORM_ADMIN_CLERK_IDS"] = previous;
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    await prisma.accessRequest.deleteMany({ where: { email } }).catch(() => undefined);
  }
});

test("a decision cannot be taken twice, and the server is what refuses", { skip }, async () => {
  const { prisma, accessRequestsRouter } = await load();
  const operator = `user_operator_${randomUUID().slice(0, 8)}`;
  const previous = process.env["PLATFORM_ADMIN_CLERK_IDS"];
  process.env["PLATFORM_ADMIN_CLERK_IDS"] = operator;
  const email = `twice-${randomUUID().slice(0, 8)}@example.test`;
  try {
    const request = await prisma.accessRequest.create({
      data: { email, name: "A Founder", company: "Twice Ltd", platform: "shopify", customerRange: "under_10k" },
    });
    const admin = accessRequestsRouter.createCaller(adminCaller(prisma, operator));

    // Pending offers three moves and no more.
    const [pending] = await admin.list({ status: "pending" });
    assert.deepEqual(
      [...(pending!.allowedActions as string[])].sort(),
      ["approve", "decline", "mark_reviewed"]
    );

    await admin.decide({ id: request.id, action: "mark_reviewed" });

    // The repeat that used to succeed.
    await assert.rejects(
      admin.decide({ id: request.id, action: "mark_reviewed" }),
      (error: { code?: string }) => error.code === "CONFLICT",
      "marking a reviewed request reviewed again must be refused by the server"
    );

    await admin.decide({ id: request.id, action: "decline", reason: "Not a fit yet" });
    await assert.rejects(
      admin.decide({ id: request.id, action: "decline" }),
      (error: { code?: string }) => error.code === "CONFLICT",
      "declining twice must be refused"
    );
    await assert.rejects(
      admin.decide({ id: request.id, action: "mark_reviewed" }),
      (error: { code?: string }) => error.code === "CONFLICT"
    );
    await assert.rejects(
      admin.approveAndInvite({ id: request.id, newWorkspaceName: "Twice" }),
      (error: { code?: string }) => error.code === "CONFLICT",
      "a declined request must be reopened before it can be approved"
    );

    // Declined offers exactly one way back.
    const declined = (await admin.list({ status: "declined" })).find((row) => row.id === request.id);
    assert.deepEqual(declined!.allowedActions, ["reopen"]);
    assert.match(declined!.summary, /declined/i);

    await admin.decide({ id: request.id, action: "reopen", reason: "They followed up" });
    const reopened = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(reopened.status, "reviewed", "reopening returns it to reviewed, not pending");

    // The whole trail survives, including the decision that was undone.
    const trail = await prisma.accessRequestDecision.findMany({
      where: { accessRequestId: request.id },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(
      trail.map((entry) => entry.action),
      ["mark_reviewed", "decline", "reopen"],
      "a reopened request must still show the decline that preceded it"
    );
    assert.equal(trail.every((entry) => entry.actorClerkId === operator), true);
    assert.equal(trail[1]!.reason, "Not a fit yet", "the reason is kept");
    assert.equal(trail[2]!.fromStatus, "declined");
    assert.equal(trail[2]!.toStatus, "reviewed");
  } finally {
    if (previous === undefined) delete process.env["PLATFORM_ADMIN_CLERK_IDS"];
    else process.env["PLATFORM_ADMIN_CLERK_IDS"] = previous;
    await prisma.accessRequest.deleteMany({ where: { email } }).catch(() => undefined);
  }
});

test("an invited request cannot be decided again until its invitation is revoked", { skip }, async () => {
  const { prisma, accessRequestsRouter } = await load();
  const operator = `user_operator_${randomUUID().slice(0, 8)}`;
  const previous = process.env["PLATFORM_ADMIN_CLERK_IDS"];
  process.env["PLATFORM_ADMIN_CLERK_IDS"] = operator;
  const marker = randomUUID().slice(0, 8);
  const email = `invited-${marker}@example.test`;
  let workspaceId: string | undefined;
  try {
    const request = await prisma.accessRequest.create({
      data: { email, name: "A Founder", company: `Invited ${marker}`, platform: "shopify", customerRange: "under_10k" },
    });
    const admin = accessRequestsRouter.createCaller(adminCaller(prisma, operator));
    const issued = await admin.approveAndInvite({ id: request.id, role: "owner" });
    workspaceId = issued.workspaceId;

    // A live invitation: revoke is the only move.
    const invited = (await admin.list()).find((row) => row.id === request.id);
    assert.equal(invited!.invitationState, "live");
    assert.deepEqual(invited!.allowedActions, ["revoke_invitation"]);
    for (const action of ["mark_reviewed", "decline", "reopen"] as const) {
      await assert.rejects(
        admin.decide({ id: request.id, action }),
        (error: { code?: string }) => error.code === "CONFLICT",
        `${action} must not be possible while an invitation is live`
      );
    }
    await assert.rejects(
      admin.approveAndInvite({ id: request.id, newWorkspaceName: "Second" }),
      (error: { code?: string }) => error.code === "CONFLICT",
      "a second live invitation would mean revoking one does not close the door"
    );

    // Revoke, and the only move becomes issuing a new one.
    await admin.decide({ id: request.id, action: "revoke_invitation", reason: "Sent to the wrong address" });
    const revoked = (await admin.list()).find((row) => row.id === request.id);
    assert.equal(revoked!.invitationState, "revoked");
    assert.deepEqual(revoked!.allowedActions, ["approve"]);
    assert.match(revoked!.summary, /revoked/i);

    // And the revoked invitation genuinely cannot be used.
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: issued.invitationId } });
    assert.ok(stored.revokedAt, "revoking must actually revoke the invitation");
    assert.equal(stored.revokedByClerkId, operator);

    // Issuing a replacement works, and both invitations survive in the trail.
    const replacement = await admin.approveAndInvite({ id: request.id, workspaceId: issued.workspaceId });
    assert.notEqual(replacement.invitationId, issued.invitationId);
    const trail = await prisma.accessRequestDecision.findMany({
      where: { accessRequestId: request.id },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(trail.map((entry) => entry.action), ["approve", "revoke_invitation", "approve"]);
    assert.equal(
      await prisma.invitation.count({ where: { email } }),
      2,
      "revoking must not delete the original invitation"
    );
  } finally {
    if (previous === undefined) delete process.env["PLATFORM_ADMIN_CLERK_IDS"];
    else process.env["PLATFORM_ADMIN_CLERK_IDS"] = previous;
    if (workspaceId) await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
    await prisma.accessRequest.deleteMany({ where: { email } }).catch(() => undefined);
  }
});
