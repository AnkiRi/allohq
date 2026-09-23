import { Suspense } from "react";
import { RouteProgress } from "@/components/layout/RouteProgress";
import { OnboardingGate } from "@/components/layout/OnboardingGate";
import { ClosedBetaGate } from "@/components/layout/ClosedBetaGate";
import { ShopifyBootstrapBoundary } from "@/components/shopify/ShopifyBootstrapBoundary";
import { RequireSession } from "@/components/layout/RequireSession";

/**
 * The shell for full-page working surfaces.
 *
 * Email Studio is a primary campaign-work surface, but it was rendered inside
 * the dashboard shell: a 204px sidebar, a top bar, ~32px of workspace padding,
 * a footer, and the global Ask Joon panel. The email canvas got whatever was
 * left, and the global chat sat beside the Studio's own Ask Joon — two chats
 * competing on one screen.
 *
 * Every GUARD the dashboard applies is applied here too, in the same order.
 * What is dropped is chrome and nothing else:
 *
 *   kept    ShopifyBootstrapBoundary, RequireSession, ClosedBetaGate,
 *           OnboardingGate, route progress
 *   dropped Sidebar, TopBar, workspace padding, Footer, AlloAIPanelProvider
 *           and its slot
 *
 * Dropping `AlloAIPanelProvider` is what removes the second chat: the global
 * panel and its Cmd+J binding only exist inside that provider, so a route
 * outside it has one Ask Joon rather than two.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopifyBootstrapBoundary>
      <RequireSession>
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#F4F2EC]">
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          <ClosedBetaGate>
            <OnboardingGate>{children}</OnboardingGate>
          </ClosedBetaGate>
        </div>
      </RequireSession>
    </ShopifyBootstrapBoundary>
  );
}
