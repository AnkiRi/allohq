import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RouteProgress } from "@/components/layout/RouteProgress";
import { AlloAIPanelProvider, AlloAIPanelSlot } from "@/components/ai/AlloAIPanel";
import { MobileSidebarProvider } from "@/components/layout/MobileSidebarContext";
import { OnboardingGate } from "@/components/layout/OnboardingGate";
import { ClosedBetaGate } from "@/components/layout/ClosedBetaGate";
import { Footer } from "@/components/layout/Footer";
import { CommandPaletteProvider, CommandPalette } from "@/components/ui/CommandPalette";
import { ShopifyBootstrapBoundary } from "@/components/shopify/ShopifyBootstrapBoundary";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopifyBootstrapBoundary>
    <CommandPaletteProvider>
    <MobileSidebarProvider>
      <div className="app-shell flex h-screen canvas-noise relative">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>

        {/* Ask Joon is a control layer shared by the shell, including the sidebar dock. */}
        <AlloAIPanelProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar />
            <div className="flex flex-1 overflow-hidden">
              <main className="app-workspace flex-1 overflow-y-auto px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pt-7">
                <div className="app-content min-h-full flex flex-col">
                  <div className="flex-1">
                    <ClosedBetaGate>
                      <OnboardingGate>{children}</OnboardingGate>
                    </ClosedBetaGate>
                  </div>
                  <Footer />
                </div>
              </main>
              <AlloAIPanelSlot />
            </div>
          </div>

          <CommandPalette />
        </AlloAIPanelProvider>
      </div>
    </MobileSidebarProvider>
    </CommandPaletteProvider>
    </ShopifyBootstrapBoundary>
  );
}
