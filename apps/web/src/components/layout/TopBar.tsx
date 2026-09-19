"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu, RotateCcw, Search, Sparkles } from "lucide-react";
import { useMobileSidebar } from "./MobileSidebarContext";
import { PulseDot } from "@/components/ui/PulseDot";
import { useCommandPalette } from "@/components/ui/CommandPalette";
import { trpc } from "@/lib/trpc";
import { useDemo } from "@/lib/useDemo";
import { formatStoreCurrency } from "@/components/console";

const routeMeta: Record<string, { title: string; description: string }> = {
  "/dashboard": { title: "Today", description: "What changed, what needs you, and what Joon is doing next." },
  "/actions": { title: "Decisions", description: "Review the work Joon prepared before anything goes live." },
  "/activity": { title: "Activity", description: "A complete record of decisions, changes, sends, and outcomes." },
  "/customers": { title: "Customers", description: "See each customer’s current state and why it changed." },
  "/campaigns": { title: "Campaigns", description: "Create, approve, deliver, and measure every campaign." },
  "/automations": { title: "Automations", description: "Triggered journeys that wait for the right moment." },
  "/conversations": { title: "Inbox", description: "Customer conversations that need attention." },
  "/brand-content": { title: "Brand & content", description: "Voice, reusable email content, forms, and product intelligence in one place." },
  "/outcomes": { title: "Results", description: "Attributed orders and control-backed evidence, clearly separated." },
  "/analytics": { title: "Analytics", description: "Understand engagement, revenue, cost, and delivery health." },
  "/segments": { title: "Segments", description: "Saved audiences, dynamic states, and their provenance." },
  "/templates": { title: "Email library", description: "Reusable emails and brand-safe starting points." },
  "/forms": { title: "Forms", description: "Grow a permissioned audience across your storefront." },
  "/intelligence/brand": { title: "Brand voice", description: "The language and guardrails Joon writes with." },
  "/intelligence/products": { title: "Product graph", description: "How products relate across purchases, categories, and collections." },
  "/integrations": { title: "Integrations", description: "Connected systems and the data Joon can use." },
  "/settings/readiness": { title: "Setup", description: "Everything required for safe, reliable delivery." },
  "/settings": { title: "Settings", description: "Workspace, sending, access, billing, and advanced controls." },
};

function resolveMeta(pathname: string) {
  const exact = routeMeta[pathname];
  if (exact) return exact;
  const base = Object.keys(routeMeta).filter((path) => path !== "/dashboard" && pathname.startsWith(`${path}/`)).sort((a, b) => b.length - a.length)[0];
  return (base ? routeMeta[base] : undefined) ?? { title: "Joon", description: "Your retention workspace." };
}

export function TopBar() {
  const { toggle } = useMobileSidebar();
  const demo = useDemo();
  const pathname = usePathname();
  const commandPalette = useCommandPalette();
  const meta = resolveMeta(pathname);
  const { data: stores } = trpc.stores.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const { data: workspaces } = trpc.workspaces.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;
  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, { enabled: onboardingDone, refetchInterval: 60000 });
  const storeId = store?.id ?? "";
  const { data: roiData } = (trpc.analytics.roi as any).useQuery(
    { storeId, days: 30 },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { aiAttributedRevenue: number } | undefined };
  const { data: latestAgentRun } = (trpc.automations.latestAgentRun as any).useQuery(
    { storeId },
    { enabled: !!storeId && onboardingDone },
  ) as { data: { createdAt: string | Date } | null | undefined };
  const aiRevenue = roiData?.aiAttributedRevenue ?? 0;
  const lastActivity = (() => {
    if (!latestAgentRun?.createdAt) return null;
    const minutes = Math.floor((Date.now() - new Date(latestAgentRun.createdAt).getTime()) / 60000);
    if (minutes < 1) return "active just now";
    if (minutes < 60) return `active ${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `active ${hours}h ago` : `active ${Math.floor(hours / 24)}d ago`;
  })();

  return (
    <header className="app-topbar flex min-h-[62px] items-center justify-between gap-4 border-b px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={toggle} className="-ml-1 rounded-lg p-2 hover:bg-muted md:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-[14px] font-medium tracking-[-0.01em] text-foreground">{meta.title}</span>
            {store?.shopDomain && <><span className="h-4 w-px bg-border" aria-hidden="true" /><span className="hidden max-w-[220px] truncate text-[12px] text-muted-foreground sm:block">{store.shopDomain.replace(/\.myshopify\.com$/i, "")}</span></>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {workspaces && workspaces.length > 1 ? (
          <label className="hidden items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 lg:flex">
            <span className="sr-only">Active workspace</span>
            <select
              value={workspaces.find((workspace) => workspace.active)?.id ?? ""}
              onChange={(event) => {
                window.localStorage.setItem("joon_active_workspace_id", event.target.value);
                window.location.assign("/dashboard");
              }}
              className="max-w-[170px] bg-transparent text-[11px] text-foreground outline-none"
              aria-label="Active workspace"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} · {workspace._count.stores} {workspace._count.stores === 1 ? "store" : "stores"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {demo && <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground lg:flex"><Sparkles className="h-3 w-3 text-[var(--app-accent)]" /> Vana sample workspace <button type="button" onClick={() => { try { sessionStorage.clear(); } catch {} window.location.assign("/dashboard"); }} className="ml-1 inline-flex items-center gap-1 text-[var(--app-accent)] hover:underline" title="Restart the demo from a clean state"><RotateCcw className="h-3 w-3" /> restart</button></span>}
        {onboardingDone && <div className="hidden items-center gap-2 rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1.5 text-[10.5px] text-[var(--app-accent)] md:flex" title={lastActivity ?? "Joon is watching this workspace"}><PulseDot color="bg-[var(--app-accent)]" />Watching {(stats?.totalCustomers ?? 0).toLocaleString("en-IN")} customers{lastActivity && <span className="hidden opacity-65 xl:inline">· {lastActivity}</span>}</div>}
        {aiRevenue > 0 && <div className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-[10.5px] text-foreground xl:flex" title="Revenue attributed to AI campaigns and automations in the last 30 days"><span className="font-mono font-semibold tabular-nums">{formatStoreCurrency(aiRevenue, store?.currency ?? "USD")}</span><span className="text-muted-foreground">· 30d</span></div>}
        <button onClick={commandPalette.open} className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-muted-foreground hover:border-[var(--app-accent-line)] hover:text-foreground sm:min-w-[164px]" aria-label="Search and open commands">
          <Search className="h-4 w-4" /><span className="hidden flex-1 text-left text-[12px] sm:inline">Search or jump to</span><kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] sm:inline">⌘K</kbd>
        </button>
        <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Notifications"><Bell className="h-[18px] w-[18px]" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--app-action)]" /></button>
      </div>
    </header>
  );
}
