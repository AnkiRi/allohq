import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RouteProgress } from "@/components/layout/RouteProgress";
import { AlloAIPanelProvider, AlloAIPanelSlot } from "@/components/ai/AlloAIPanel";
import { MobileSidebarProvider } from "@/components/layout/MobileSidebarContext";
import { OnboardingGate } from "@/components/layout/OnboardingGate";
import { CommandPaletteProvider, CommandPalette } from "@/components/ui/CommandPalette";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
    <MobileSidebarProvider>
      <div className="flex h-screen canvas-noise relative overflow-hidden">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>

        {/* Sidebar */}
        <Sidebar />

        {/* Main content — provider wraps TopBar + content so TopBar can open the AI panel */}
        <AlloAIPanelProvider>
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar />
            <div className="flex flex-1 overflow-hidden">
              <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
                <OnboardingGate>{children}</OnboardingGate>
              </main>
              <AlloAIPanelSlot />
            </div>
          </div>
        </AlloAIPanelProvider>
        <CommandPalette />
      </div>
    </MobileSidebarProvider>
    </CommandPaletteProvider>
  );
}
