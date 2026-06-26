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
    agentUrl.hostname = `agent.${host}`;
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
