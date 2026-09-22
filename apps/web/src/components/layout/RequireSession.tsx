"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { isEmbeddedShopifyApp } from "@/lib/shopify-app-bridge";
import { sessionDecision } from "@/lib/session-decision";

/**
 * Send a signed-out visitor to sign-in instead of an empty app.
 *
 * The dashboard path roots are deliberately exempt from Clerk's middleware
 * (`SHOPIFY_APP_SHELL_ROOTS`), so an embedded Shopify install works in browsers
 * that block third-party cookies — its credential is an App Bridge token, not a
 * Clerk cookie. The side effect was that a signed-out person opening
 * `/dashboard` got the shell: menus, a connect-store form, an inert sign-out
 * button, and every panel empty because each API call was refused. Nothing was
 * exposed — every procedure still requires authentication — but it read as a
 * broken product rather than a closed door.
 *
 * So the check lives here rather than in middleware, which cannot see an App
 * Bridge token. Embedded Shopify renders as before; anyone else needs a Clerk
 * session or goes to sign-in.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Read once, on the client, and only when Clerk has settled: calling it
  // during the first render would say "not embedded" before App Bridge exists.
  const embedded = typeof window !== "undefined" && isEmbeddedShopifyApp();

  const decision = sessionDecision({ isLoaded, isSignedIn: Boolean(isSignedIn), embedded });

  useEffect(() => {
    if (decision !== "redirect") return;
    // Come back here afterwards rather than dropping them on a default page.
    router.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname)}`);
  }, [decision, pathname, router]);

  // Render nothing while Clerk settles, and nothing for a signed-out visitor
  // while the redirect runs. A flash of the empty shell is the thing being
  // fixed.
  if (decision !== "render") return null;
  return <>{children}</>;
}
