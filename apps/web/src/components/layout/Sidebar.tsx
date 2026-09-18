"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleGauge, Database, FileText, Inbox, ListChecks, LogOut, Mail, MessageSquare, Settings, Sparkles, Users, Workflow } from "lucide-react";
import { cn } from "@allohq/ui";
import { useMobileSidebar } from "./MobileSidebarContext";
import { trpc } from "@/lib/trpc";
import { useAlloAI } from "@/components/ai/AlloAIPanel";

type NavItem = { name: string; href: string; icon: typeof CalendarDays; badge?: boolean };
const primaryItems: NavItem[] = [
  { name: "Today", href: "/dashboard", icon: CalendarDays },
  { name: "Decisions", href: "/actions", icon: ListChecks, badge: true },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Campaigns", href: "/campaigns", icon: Mail },
  { name: "Automations", href: "/automations", icon: Workflow },
  { name: "Results", href: "/outcomes", icon: CircleGauge },
  { name: "Activity", href: "/activity", icon: FileText },
  { name: "Inbox", href: "/conversations", icon: Inbox },
];
const brandItems: { name: string; href: string }[] = [
  { name: "Overview", href: "/brand-content" },
  { name: "Email library", href: "/templates" },
  { name: "Forms", href: "/forms" },
  { name: "Brand voice", href: "/intelligence/brand" },
  { name: "Product graph", href: "/intelligence/products" },
];
const dataItems: { name: string; href: string }[] = [
  { name: "Analytics", href: "/analytics" },
  { name: "Segments", href: "/segments" },
  { name: "Orders", href: "/orders" },
  { name: "Products", href: "/products" },
  { name: "Store & integrations", href: "/integrations" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { openPanel: askJoon } = useAlloAI();
  const { isOpen, close, collapsed, toggleCollapsed } = useMobileSidebar();
  const { data: stores } = trpc.stores.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const store = stores?.[0];
  const onboardingDone = !!store?.onboardingCompletedAt;
  const { data: activationData } = (trpc.stores.activationStatus as any).useQuery({ storeId: store?.id ?? "" }, { enabled: !!store?.id && onboardingDone, refetchInterval: 30000 }) as { data: any | undefined };
  const pendingCount = onboardingDone ? (activationData?.context?.pendingActions ?? 0) : 0;
  const setupComplete = activationData?.progress?.completed ?? activationData?.completed ?? 0;
  const setupTotal = activationData?.progress?.total ?? activationData?.total ?? 5;
  const initials = user ? (user.firstName?.[0] || "") + (user.lastName?.[0] || "") || user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() || "U" : "U";
  const signOutRedirect = process.env.NODE_ENV === "production" ? (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host.replace(/^agent\./, "")}` : "https://joonhq.ai") : "/";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const customerWorkspaceActive = isActive("/customers") || isActive("/segments") || isActive("/intelligence/products");
  const isCustomerWorkspaceAlias = (href: string) => href === "/segments" || href === "/intelligence/products";
  const isNestedActive = (href: string) => !isCustomerWorkspaceAlias(href) && isActive(href);

  const navItem = (item: NavItem) => {
    const active = item.href === "/customers" ? customerWorkspaceActive : isActive(item.href);
    return <Link key={item.name} href={item.href} onClick={close} aria-current={active ? "page" : undefined} className={cn("group/nav relative flex min-h-10 items-center rounded-[9px] text-[14px] transition-colors", collapsed ? "justify-center px-2" : "gap-3 px-3", active ? "bg-[var(--surface)] font-medium text-[var(--ink)]" : "text-white/78 hover:bg-white/[0.07] hover:text-white")}>
      <item.icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.1 : 1.7} />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.name}</span>}
      {item.badge && pendingCount > 0 && <span className={cn("flex min-w-5 items-center justify-center rounded-full bg-[var(--attention-on-dark)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--ink)]", collapsed && "absolute -right-1 -top-1")}>{pendingCount > 99 ? "99+" : pendingCount}</span>}
      {collapsed && <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-[var(--ink)] px-2.5 py-1.5 text-[12px] text-white opacity-0 shadow-lg transition-opacity group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100">{item.name}</span>}
    </Link>;
  };

  return <>
    {isOpen && <button className="fixed inset-0 z-40 bg-black/35 md:hidden" onClick={close} aria-label="Close navigation" />}
    <aside className={cn("app-sidebar fixed inset-y-0 left-0 z-50 flex flex-col border-r transition-[width,transform] duration-200 md:static md:translate-x-0", collapsed ? "w-[68px]" : "w-[204px]", isOpen ? "translate-x-0" : "-translate-x-full")}>
      <div className={cn("flex h-[68px] items-center", collapsed ? "justify-center px-3" : "px-6")}><Link href="/dashboard" className="flex items-center gap-2" aria-label="Joon home"><span className="h-2.5 w-2.5 rounded-full bg-[var(--attention-on-dark)]" />{!collapsed && <span className="text-[17px] font-medium tracking-[-0.02em] text-white">joon</span>}</Link></div>
      {!collapsed && <p className="px-6 pb-5 font-mono text-[12px] uppercase leading-[1.45] tracking-[0.18em] text-white/62">Your retention,<br />handled</p>}
      <nav className="app-sidebar-scroll flex-1 overflow-y-auto px-3" aria-label="Main navigation">
        <div className="space-y-0.5">{primaryItems.map(navItem)}</div>
        {!collapsed && <details open={brandItems.some(({ href }) => isNestedActive(href))} className="group rounded-[9px] text-white/78">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-[9px] px-3 text-[14px] hover:bg-white/[0.07] hover:text-white"><Sparkles className="h-4 w-4" /><span className="flex-1">Brand & content</span><span className="transition-transform group-open:rotate-45">＋</span></summary>
          <div className="ml-3 border-l border-white/12 pl-2">
            {brandItems.map(({ name, href }) => { const active = isNestedActive(href); return <Link key={href} href={href} onClick={close} aria-current={active ? "page" : undefined} className={cn("block rounded-md px-3 py-1.5 text-[12px] hover:bg-white/[0.07] hover:text-white", active && "bg-white/[0.11] font-medium text-white")}>{name}</Link>; })}
          </div>
        </details>}
        {!collapsed && <details open={dataItems.some(({ href }) => isNestedActive(href))} className="group rounded-[9px] text-white/78">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-[9px] px-3 text-[14px] hover:bg-white/[0.07] hover:text-white"><Database className="h-4 w-4" /><span className="flex-1">Data & store</span><span className="transition-transform group-open:rotate-45">＋</span></summary>
          <div className="ml-3 border-l border-white/12 pl-2">
            {dataItems.map(({ name, href }) => { const active = isNestedActive(href); return <Link key={href} href={href} onClick={close} aria-current={active ? "page" : undefined} className={cn("block rounded-md px-3 py-1.5 text-[12px] hover:bg-white/[0.07] hover:text-white", active && "bg-white/[0.11] font-medium text-white")}>{name}</Link>; })}
          </div>
        </details>}
        <Link href="/settings/readiness" onClick={close} className={cn("mt-4 block rounded-xl border border-white/15 bg-white/[0.045] p-3 text-white", collapsed && "p-2 text-center")}>
          {collapsed ? <CheckCircle2 className="mx-auto h-4 w-4" /> : <><div className="flex items-center justify-between text-[13px]"><span>Setup status</span><span>{setupComplete} of {setupTotal}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-[var(--attention-on-dark)]" style={{ width: `${Math.min(100, (setupComplete / Math.max(1, setupTotal)) * 100)}%` }} /></div></>}
        </Link>
      </nav>
      <div className="space-y-0.5 border-t border-white/10 p-3">{navItem({ name: "Settings", href: "/settings", icon: Settings })}<button onClick={askJoon} className={cn("flex min-h-10 w-full items-center rounded-[9px] text-[14px] text-white/78 hover:bg-white/[0.07] hover:text-white", collapsed ? "justify-center px-2" : "gap-3 px-3")}><MessageSquare className="h-4 w-4" />{!collapsed && <span>Ask Joon</span>}</button></div>
      <div className="border-t border-white/10 p-3"><div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-2 px-1")}>
        {user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px] text-white">{initials}</div>}
        {!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-[12px] text-white">{user?.fullName || "Your workspace"}</p><p className="truncate text-[10px] text-white/45">{store?.shopDomain || user?.emailAddresses[0]?.emailAddress}</p></div>}
        <button onClick={toggleCollapsed} className="hidden rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white md:flex" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}</button>
        {!collapsed && <button onClick={() => signOut({ redirectUrl: signOutRedirect })} className="rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>}
      </div></div>
    </aside>
  </>;
}
