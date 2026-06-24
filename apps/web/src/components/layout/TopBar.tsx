"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, Bell, ChevronRight, DollarSign, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useMobileSidebar } from "./MobileSidebarContext";
import { PulseDot } from "@/components/ui/PulseDot";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { useCommandPalette } from "@/components/ui/CommandPalette";
import { trpc } from "@/lib/trpc";
import { useDemo } from "@/lib/useDemo";

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

function getBreadcrumb(pathname: string): string[] {
  if (routeLabels[pathname]) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 1) {
      const parent = "/" + segments[0];
      if (routeLabels[parent]) {
        return [routeLabels[parent], routeLabels[pathname]];
      }
    }
    return [routeLabels[pathname]];
  }
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

export function TopBar() {
  const { toggle } = useMobileSidebar();
  const demo = useDemo();
  const pathname = usePathname();
  const commandPalette = useCommandPalette();
  const isDashboard = pathname === "/dashboard";

  const breadcrumb = getBreadcrumb(pathname);

  // Data queries
  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, {
    enabled: onboardingDone,
    refetchInterval: 60000,
  });

  const storeId = store?.id ?? "";
  const totalCustomers = stats?.totalCustomers ?? 0;

  // ROI data — real AI-attributed revenue
  const { data: roiData } = (trpc.analytics.roi as any).useQuery(
    { storeId, days: 30 },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { aiAttributedRevenue: number } | undefined };
  const aiRevenue = roiData?.aiAttributedRevenue ?? 0;

  // Latest agent activity timestamp
  const { data: latestAgentRun } = (trpc.automations.latestAgentRun as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { createdAt: string | Date } | null | undefined };

  const lastActivityText = (() => {
    if (!latestAgentRun?.createdAt) return null;
    const diff = Date.now() - new Date(latestAgentRun.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Active just now";
    if (mins < 60) return `Active ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Active ${hours}h ago`;
    return `Active ${Math.floor(hours / 24)}d ago`;
  })();

  return (
    <header className="flex items-center justify-between px-3 sm:px-4 md:px-6 py-3">
      <div className="flex items-center gap-3">
        {/* Hamburger — visible on mobile only */}
        <button
          onClick={toggle}
          className="p-1.5 rounded-lg hover:bg-white/30 dark:hover:bg-white/10 transition-colors md:hidden"
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>

        {/* Dashboard: back arrow + breadcrumb only */}
        {isDashboard ? (
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <span className="text-[11px] font-sans tracking-[0.5px] uppercase text-muted-foreground">
              Home
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <Link
                href="/dashboard"
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
              {breadcrumb.map((label, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
                  <span
                    className={`text-[11px] font-sans tracking-[0.5px] uppercase ${
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
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Demo indicator — subtle, single pill, only when the demo flag is set */}
        {demo && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border text-[10.5px] font-mono text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))]" />
            Demo store · Vana Naturals
          </span>
        )}

        {/* Agent Status Pill */}
        {onboardingDone && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/[0.08] border border-primary/15">
            <PulseDot color="bg-primary" />
            <span className="text-[11px] font-sans text-primary/85">
              allo is watching over {totalCustomers.toLocaleString("en-IN")} customers
            </span>
            {lastActivityText && (
              <span className="text-[10px] font-sans text-primary/60">
                {lastActivityText}
              </span>
            )}
          </div>
        )}

        {/* Revenue Counter */}
        {aiRevenue > 0 && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ backgroundColor: "color-mix(in srgb, var(--color-warning) 10%, transparent)", borderColor: "color-mix(in srgb, var(--color-warning) 22%, transparent)" }}>
            <DollarSign className="w-3.5 h-3.5" style={{ color: "var(--color-warning)" }} />
            <AnimatedCounter
              value={Math.round(aiRevenue)}
              prefix="₹"
              className="text-[12px] font-mono font-bold tabular-nums"
              style={{ color: "var(--color-warning)" }}
              duration={0.8}
            />
            <span className="text-[10px] font-sans" style={{ color: "color-mix(in srgb, var(--color-warning) 70%, transparent)" }}>AI revenue · 30d</span>
          </div>
        )}

        {/* Command Palette Trigger */}
        <button
          onClick={commandPalette.open}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/3 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground hidden sm:inline">Search...</span>
          <kbd className="text-[10px] font-mono text-muted-foreground/60 bg-white/80 dark:bg-white/10 px-1.5 py-0.5 rounded border border-black/5 dark:border-white/10 hidden sm:inline">
            ⌘K
          </kbd>
        </button>

        {/* Theme moved to Settings → Appearance (not floating in the nav). */}

        {/* Bell */}
        <button className="relative p-2 rounded-lg hover:bg-black/3 dark:hover:bg-white/5 transition-colors">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#1F7A4F]" />
        </button>
      </div>
    </header>
  );
}
