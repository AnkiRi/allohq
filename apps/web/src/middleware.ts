import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { DEMO_COOKIE, isValidDemoToken } from "@/lib/demoToken";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/",
  "/demo-emails(.*)",
  "/options(.*)",
  "/try(.*)", // private token-gated demo entry (token validated in the page)
]);

export default clerkMiddleware(async (auth, request) => {
  const host = request.headers.get("host") || "";

  // Domain migration: joonhq.com is primary. Permanently redirect joonhq.ai AND the
  // legacy allohq.ai (apex / www / agent) to the joonhq.com equivalent, preserving
  // the subdomain and full path + query. (This is the web front door only — the API
  // on api.allohq.ai is a separate Railway service and never routes through here.)
  const hostname = request.nextUrl.hostname;
  if (hostname.endsWith("joonhq.ai") || hostname.endsWith("allohq.ai")) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.port = "";
    url.hostname = hostname.replace(/(?:joonhq|allohq)\.ai$/, "joonhq.com");
    return NextResponse.redirect(url, 308);
  }

  const isRootDomain =
    !host.startsWith("agent.") &&
    !host.startsWith("localhost") &&
    !host.startsWith("allohq-web");

  // Root domain (allohq.ai) — only serve landing page, redirect everything else
  if (isRootDomain) {
    if (request.nextUrl.pathname === "/") {
      return NextResponse.next();
    }
    const agentUrl = new URL(request.url);
    // Strip a leading "www." so the app subdomain is always "agent.<apex>"
    // (host "www.allohq.ai" must map to "agent.allohq.ai", NOT the non-existent
    // "agent.www.allohq.ai").
    agentUrl.hostname = `agent.${host.replace(/^www\./, "")}`;
    return NextResponse.redirect(agentUrl);
  }

  // agent.allohq.ai / localhost — normal auth, with ONE exception: a logged-out
  // visitor holding a VALID demo-token cookie (set by the /try gate) may reach the
  // app as the Vana demo. Data is server-guarded (demo-guest + write-floor + caps
  // + cross-tenant guards) regardless, so this only opens the read-only sandbox.
  if (!isPublicRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      const demoToken = request.cookies.get(DEMO_COOKIE)?.value;
      if (!isValidDemoToken(demoToken)) {
        await auth.protect(); // no session, no valid demo token → sign-in
      }
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
