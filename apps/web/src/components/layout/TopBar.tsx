"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Bell, ChevronRight, Menu } from "lucide-react";
import { useAlloAI } from "@/components/ai/AlloAIPanel";
import { useMobileSidebar } from "./MobileSidebarContext";

const routeLabels: Record<string, string> = {
  "/dashboard": "Home",
  "/customers": "Customers",
  "/segments": "Segments",
  "/intelligence": "Intelligence",
  "/intelligence/brand": "Brand Voice",
  "/intelligence/cohorts": "Cohort Analysis",
  "/intelligence/rfm": "RFM Scoring",
  "/templates": "Templates",
  "/campaigns": "Campaigns",
  "/automations": "Automations",
  "/analytics": "Analytics",
  "/integrations": "Integrations",
  "/integrations/shopify": "Shopify",
  "/settings": "Settings",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getBreadcrumb(pathname: string): string[] {
  // Direct match
  if (routeLabels[pathname]) {
    // Check if it's a nested route (has a parent)
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 1) {
      const parent = "/" + segments[0];
      if (routeLabels[parent]) {
        return [routeLabels[parent], routeLabels[pathname]];
      }
    }
    return [routeLabels[pathname]];
  }

  // Fallback: build from path segments
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

export function TopBar() {
  const { openPanel, focusInput } = useAlloAI();
  const { toggle } = useMobileSidebar();
  const pathname = usePathname();
  const { user } = useUser();

  const greeting = getGreeting();
  const firstName = user?.firstName || "there";
  const breadcrumb = getBreadcrumb(pathname);

  // Cmd+K to open AI panel & focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPanel();
        focusInput();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPanel, focusInput]);

  return (
    <header className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3">
      <div className="flex items-center gap-3">
        {/* Hamburger — visible on mobile only */}
        <button
          onClick={toggle}
          className="p-1.5 rounded-lg hover:bg-white/30 transition-colors md:hidden"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
        <span className="text-[13px] font-mono text-foreground hidden sm:inline">
          {greeting}, <span className="font-semibold">{firstName}</span>
        </span>
        <span className="text-[11px] text-muted-foreground/40 select-none">/</span>
        <div className="flex items-center gap-1">
          {breadcrumb.map((label, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
              <span
                className={`text-[11px] font-mono tracking-[0.5px] uppercase ${
                  i === breadcrumb.length - 1
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
                }`}
              >
                {label}
              </span>
            </span>
          ))}
        </div>
      </div>
      <button className="relative p-2 rounded-lg hover:bg-white/30 transition-colors">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-terracotta rounded-full" />
      </button>
    </header>
  );
}
