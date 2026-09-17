"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Activity, BarChart3, BookOpen, Brain, ChevronLeft, ChevronRight, CircleGauge, GitBranch, LayoutDashboard, ListChecks, LogOut, Mail, MessageSquare, MousePointerClick, Settings, ShieldCheck, Sparkles, Store, Target, Users } from "lucide-react";
import { cn } from "@allohq/ui";
import { useMobileSidebar } from "./MobileSidebarContext";
import { trpc } from "@/lib/trpc";

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard; badge?: boolean };

const groups: { label: string; items: NavItem[] }[] = [
  { label: "Focus", items: [
    { name: "Today", href: "/dashboard", icon: LayoutDashboard },
    { name: "Decisions", href: "/actions", icon: ListChecks, badge: true },
    { name: "Activity", href: "/activity", icon: Activity },
  ] },
  { label: "Engage", items: [
    { name: "Customers", href: "/customers", icon: Users },
    { name: "Campaigns", href: "/campaigns", icon: Mail },
    { name: "Automations", href: "/automations", icon: Sparkles },
    { name: "Inbox", href: "/conversations", icon: MessageSquare },
  ] },
  { label: "Learn", items: [
    { name: "Results", href: "/outcomes", icon: Target },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Segments", href: "/segments", icon: CircleGauge },
  ] },
  { label: "Create", items: [
    { name: "Email library", href: "/templates", icon: BookOpen },
    { name: "Forms", href: "/forms", icon: MousePointerClick },
    { name: "Brand voice", href: "/intelligence/brand", icon: Brain },
    { name: "Product graph", href: "/intelligence/products", icon: GitBranch },
  ] },
];

const utilityItems: NavItem[] = [
  { name: "Setup", href: "/settings/readiness", icon: ShieldCheck },
  { name: "Integrations", href: "/integrations", icon: Store },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isOpen, close, collapsed, toggleCollapsed } = useMobileSidebar();
  const signOutRedirect = process.env.NODE_ENV === "production"
    ? typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host.replace(/^agent\./, "")}`
      : "https://joonhq.ai"
    : "/";

  const { data: stores } = trpc.stores.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;
  const { data: activationData } = (trpc.stores.activationStatus as any).useQuery(
    { storeId: store?.id ?? "" },
    { enabled: !!store?.id && onboardingDone, refetchInterval: 30000 },
  ) as { data: any | undefined };
  const pendingCount = onboardingDone ? (activationData?.context?.pendingActions ?? 0) : 0;
  const initials = user
    ? (user.firstName?.[0] || "") + (user.lastName?.[0] || "") || user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() || "U"
    : "U";

  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings" || (pathname.startsWith("/settings/") && pathname !== "/settings/readiness");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link key={item.name} href={item.href} onClick={close} aria-current={active ? "page" : undefined}
        className={cn("group/nav relative flex min-h-9 items-center rounded-lg text-[13px] transition-colors", collapsed ? "justify-center px-2" : "gap-3 px-3", active ? "bg-[var(--app-nav-active)] font-semibold text-[var(--app-nav-active-ink)]" : "text-[var(--app-nav-muted)] hover:bg-[var(--app-nav-hover)] hover:text-[var(--app-nav-ink)]")}
      >
        <item.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.name}</span>}
        {item.badge && pendingCount > 0 && <span className={cn("flex min-w-[19px] items-center justify-center rounded-full bg-[var(--app-action)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--app-action-ink)]", collapsed && "absolute -right-1 -top-1")}>{pendingCount > 99 ? "99+" : pendingCount}</span>}
        {collapsed && <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-[var(--app-nav-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--app-nav)] opacity-0 shadow-lg transition-opacity group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100">{item.name}</span>}
      </Link>
    );
  };

  return (
    <>
      {isOpen && <button className="fixed inset-0 z-40 bg-black/35 md:hidden" onClick={close} aria-label="Close navigation" />}
      <aside className={cn("app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-[width,transform] duration-200 md:static md:translate-x-0", collapsed ? "w-[68px]" : "w-[236px]", isOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className={cn("flex h-[68px] items-center border-b border-white/10", collapsed ? "justify-center px-3" : "px-5")}>
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Joon home">
            <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--app-accent)] text-[var(--app-accent-ink)]"><span className="h-2 w-2 rounded-full bg-current" /></span>
            {!collapsed && <span><span className="block text-[17px] font-semibold leading-none tracking-[-0.02em] text-white">joon</span><span className="mt-1 block text-[10px] leading-none text-white/50">Retention, handled</span></span>}
          </Link>
        </div>
        <nav className="app-sidebar-scroll flex-1 overflow-y-auto px-2.5 py-4" aria-label="Main navigation">
          {groups.map((group, index) => <div key={group.label} className={cn(index > 0 && "mt-5")}>
            {!collapsed && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{group.label}</p>}
            <div className="space-y-0.5">{group.items.map(navItem)}</div>
          </div>)}
        </nav>
        <div className="border-t border-white/10 px-2.5 py-3"><div className="space-y-0.5">{utilityItems.map(navItem)}</div></div>
        <div className="border-t border-white/10 p-2.5">
          <div className={cn("flex items-center rounded-lg", collapsed ? "flex-col gap-1" : "gap-2 px-2 py-1.5")}>
            {user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">{initials}</div>}
            {!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium text-white">{user?.fullName || "Your workspace"}</p><p className="truncate text-[10px] text-white/45">{store?.shopDomain || user?.emailAddresses[0]?.emailAddress}</p></div>}
            <button onClick={toggleCollapsed} className="hidden rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white md:flex" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
            {!collapsed && <button onClick={() => signOut({ redirectUrl: signOutRedirect })} className="rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>}
          </div>
        </div>
      </aside>
    </>
  );
}
