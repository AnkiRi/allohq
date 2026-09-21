import type { IncomingMessage } from "node:http";
import { verifyToken } from "@clerk/backend";

/**
 * Who is calling the agent endpoint.
 *
 * Its own module, deliberately: `agent-stream.ts` imports the agent runtime,
 * and a test that wants to prove "unauthenticated requests are refused" should
 * not have to load a model stack to find out.
 */
export type AgentCaller =
  | { clerkUserId: string }
  | { error: string; status: number };

export async function authenticateAgentRequest(req: IncomingMessage): Promise<AgentCaller> {
  const header = req.headers["authorization"];
  const raw = Array.isArray(header) ? header[0] : header;
  const token = raw && raw.startsWith("Bearer ") && raw.length > 7 ? raw.slice(7) : null;
  if (!token) return { error: "Unauthorized", status: 401 };

  // A server with no Clerk secret cannot authenticate anyone. Refuse rather
  // than calling out to verify — an unconfigured deployment must fail closed,
  // and reaching the network here would make an unauthenticated request cost
  // something and take as long as a timeout.
  const secretKey = process.env["CLERK_SECRET_KEY"];
  if (!secretKey) return { error: "Unauthorized", status: 401 };

  try {
    const payload = await verifyToken(token, { secretKey });
    if (!payload?.sub) return { error: "Unauthorized", status: 401 };
    return { clerkUserId: payload.sub };
  } catch {
    return { error: "Unauthorized", status: 401 };
  }
}

/**
 * The store this caller is allowed to act on, or nothing.
 *
 * Membership of the owning workspace is the condition. Returning `null` for
 * both "no such store" and "not this caller's store" is deliberate: the
 * endpoint answers identically either way, so a response cannot be used to
 * tell one from the other.
 */
export async function authoriseStore(input: {
  clerkUserId: string;
  storeId: string;
}): Promise<{ id: string } | null> {
  const { prisma } = await import("@allohq/database");
  return prisma.store.findFirst({
    where: {
      id: input.storeId,
      workspace: { members: { some: { user: { clerkId: input.clerkUserId } } } },
    },
    select: { id: true },
  });
}
