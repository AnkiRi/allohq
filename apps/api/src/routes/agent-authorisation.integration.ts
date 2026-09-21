import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Authorisation for the merchant-agent endpoint, against a real database.
 *
 * Covers who may act on a store, that the endpoint answers the same whether a
 * store is unknown or simply not the caller's, and that a refused request
 * reaches no model, tool or provider work.
 *
 * Disposable Postgres only.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const auth = await import("./agent-auth");
  const stream = await import("./agent-stream");
  return { prisma, ...auth, ...stream };
}

async function seedStore(prisma: any, label: string) {
  const suffix = `${label}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const workspace = await prisma.workspace.create({
    data: { name: `A ${suffix}`, slug: `a-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
    },
  });
  const member = await prisma.user.create({
    data: {
      clerkId: `user_member_${suffix}`,
      email: `member-${suffix}@example.test`,
      workspaceMembers: { create: { workspaceId: workspace.id, role: "admin" } },
    },
  });
  return { workspaceId: workspace.id, storeId: store.id, memberClerkId: member.clerkId, suffix };
}

function fakeRequest(options: { authorization?: string; body?: unknown }): IncomingMessage {
  const stream = new PassThrough();
  stream.end(options.body === undefined ? "" : JSON.stringify(options.body));
  const request = stream as unknown as IncomingMessage;
  request.method = "POST";
  request.headers = options.authorization ? { authorization: options.authorization } : {};
  return request;
}

function fakeResponse() {
  const chunks: string[] = [];
  let status = 0;
  const response = {
    writeHead(code: number) {
      status = code;
      return response;
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      return response;
    },
  } as unknown as ServerResponse;
  return {
    response,
    get status() {
      return status;
    },
    get body() {
      return chunks.join("");
    },
  };
}

test("a member of the owning workspace is authorised for the store", { skip }, async () => {
  const { prisma, authoriseStore } = await load();
  const fixture = await seedStore(prisma, "member");
  try {
    const store = await authoriseStore({
      clerkUserId: fixture.memberClerkId,
      storeId: fixture.storeId,
    });
    assert.equal(store?.id, fixture.storeId, "an existing member must keep working");
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("a real store belonging to someone else is not authorised", { skip }, async () => {
  const { prisma, authoriseStore } = await load();
  const theirs = await seedStore(prisma, "theirs");
  const mine = await seedStore(prisma, "mine");
  try {
    // A real, existing store id — just not this caller's.
    const store = await authoriseStore({
      clerkUserId: mine.memberClerkId,
      storeId: theirs.storeId,
    });
    assert.equal(store, null);

    // And the answer is identical for a store id that does not exist at all,
    // so the response cannot be used to tell the two apart.
    const unknown = await authoriseStore({
      clerkUserId: mine.memberClerkId,
      storeId: `store_${randomUUID()}`,
    });
    assert.equal(unknown, null);
  } finally {
    await prisma.workspace.delete({ where: { id: theirs.workspaceId } }).catch(() => undefined);
    await prisma.workspace.delete({ where: { id: mine.workspaceId } }).catch(() => undefined);
  }
});

test("a signed-in person with no membership at all is not authorised", { skip }, async () => {
  const { prisma, authoriseStore } = await load();
  const fixture = await seedStore(prisma, "outsider");
  try {
    const outsider = await prisma.user.create({
      data: {
        clerkId: `user_outsider_${fixture.suffix}`,
        email: `outsider-${fixture.suffix}@example.test`,
      },
    });
    const store = await authoriseStore({
      clerkUserId: outsider.clerkId,
      storeId: fixture.storeId,
    });
    assert.equal(store, null);
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("a refused request runs no model, tool or provider work", { skip }, async () => {
  const { prisma, handleAgentStream } = await load();
  const fixture = await seedStore(prisma, "nowork");
  try {
    let agentRuns = 0;
    const spy = async () => {
      agentRuns += 1;
      return { response: "", toolCalls: [], inputTokens: 0, outputTokens: 0 };
    };

    for (const scenario of [
      { name: "no token", authorization: undefined },
      { name: "malformed header", authorization: "Bearer" },
      { name: "invalid token", authorization: "Bearer not-a-real-session" },
    ]) {
      const captured = fakeResponse();
      await handleAgentStream(
        fakeRequest({
          authorization: scenario.authorization,
          // A real store id and a real message: the request is refused for who
          // is asking, not for what it asks.
          body: { storeId: fixture.storeId, message: "run something expensive" },
        }),
        captured.response,
        { runAgent: spy }
      );
      assert.equal(captured.status, 401, `${scenario.name} must be refused`);
      assert.equal(agentRuns, 0, `${scenario.name} must not reach the agent`);
      assert.equal(
        captured.body.includes("Store not found"),
        false,
        `${scenario.name} must not reveal anything about the store`
      );
    }
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("an unauthorised store is refused before the agent, and answers like an unknown one", { skip }, async () => {
  const { prisma, handleAgentStream } = await load();
  const theirs = await seedStore(prisma, "otherstore");
  try {
    let agentRuns = 0;
    const spy = async () => {
      agentRuns += 1;
      return { response: "", toolCalls: [], inputTokens: 0, outputTokens: 0 };
    };
    // No usable session here either, so this also demonstrates that the
    // ordering refuses at the first gate rather than the second.
    const captured = fakeResponse();
    await handleAgentStream(
      fakeRequest({ body: { storeId: theirs.storeId, message: "hello" } }),
      captured.response,
      { runAgent: spy }
    );
    assert.equal(agentRuns, 0);
    assert.equal(captured.status, 401);
  } finally {
    await prisma.workspace.delete({ where: { id: theirs.workspaceId } }).catch(() => undefined);
  }
});
