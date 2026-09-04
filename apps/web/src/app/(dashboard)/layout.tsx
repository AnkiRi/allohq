import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RouteProgress } from "@/components/layout/RouteProgress";
import { AlloAIPanelProvider, AlloAIPanelSlot } from "@/components/ai/AlloAIPanel";
import { MobileSidebarProvider } from "@/components/layout/MobileSidebarContext";
import { OnboardingGate } from "@/components/layout/OnboardingGate";
import { Footer } from "@/components/layout/Footer";
import { CommandPaletteProvider, CommandPalette } from "@/components/ui/CommandPalette";
import { ShopifyBootstrapBoundary } from "@/components/shopify/ShopifyBootstrapBoundary";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopifyBootstrapBoundary>
    <CommandPaletteProvider>
    <MobileSidebarProvider>
      <div className="flex h-screen canvas-noise relative">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>

        {/* Sidebar — needs overflow-visible for collapsed tooltips */}
        <Sidebar />

        {/* Main content — provider wraps TopBar + content so TopBar can open the AI panel */}
        <AlloAIPanelProvider>
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar />
            <div className="flex flex-1 overflow-hidden">
              <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
                <div className="min-h-full flex flex-col">
                  <div className="flex-1">
                    <OnboardingGate>{children}</OnboardingGate>
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
