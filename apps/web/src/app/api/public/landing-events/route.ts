import { prisma } from "@allohq/database";
import { NextRequest, NextResponse } from "next/server";
import {
  LANDING_EVENT_MAX_BYTES,
  isSameOriginBrowserRequest,
  landingEventAllowed,
  parseLandingEventBody,
  readBoundedBody,
  requestIp,
} from "@/lib/landing-event-guard";

export async function POST(request: NextRequest) {
  const noContent = () => new NextResponse(null, { status: 204 });
  if (!isSameOriginBrowserRequest(request)) return noContent();
  const declaredBytes = Number(request.headers.get("content-length") ?? "0");
  if (declaredBytes > LANDING_EVENT_MAX_BYTES || !landingEventAllowed(requestIp(request.headers))) return noContent();
  const body = await readBoundedBody(request).catch(() => null);
  if (body === null) return noContent();
  const parsed = parseLandingEventBody(body);
  if (!parsed) return noContent();
  try {
    await prisma.landingAnalyticsEvent.create({
      data: {
        event: parsed.event,
        data: "data" in parsed ? parsed.data : undefined,
      },
    });
  } catch {
    // Analytics must never break the landing or expose database internals.
  }
  return noContent();
}
