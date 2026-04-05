import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/"]);

export default clerkMiddleware(async (auth, request) => {
  const host = request.headers.get("host") || "";

  // Root domain (allohq.ai) — only serve landing page, redirect everything else
  if (!host.startsWith("agent.") && !host.startsWith("localhost") && !host.startsWith("allohq-web")) {
    if (request.nextUrl.pathname === "/") {
      return NextResponse.next();
    }
    // Redirect any other path to agent subdomain
    const agentUrl = new URL(request.url);
    agentUrl.hostname = `agent.${host}`;
    return NextResponse.redirect(agentUrl);
  }

  // agent.allohq.ai — normal auth
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
