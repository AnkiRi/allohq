import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { RouteProgress } from "@/components/layout/RouteProgress";
import { AlloAIPanelProvider, AlloAIPanelSlot } from "@/components/ai/AlloAIPanel";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
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
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
            <AlloAIPanelSlot />
          </div>
        </div>
      </AlloAIPanelProvider>
    </div>
  );
}
