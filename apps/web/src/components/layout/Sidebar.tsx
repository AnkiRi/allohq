"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  Layers,
  FileText,
  Mail,
  Sparkles,
  BarChart3,
  Settings,
  Store,
  LogOut,
  ListChecks,
  MousePointerClick,
  MessageSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Brain,
  Target,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { useMobileSidebar } from "./MobileSidebarContext";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";

const primaryNav = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Actions", href: "/actions", icon: ListChecks, showBadge: true },
  { name: "Outcomes", href: "/outcomes", icon: Target },
  { name: "Performance", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
] as const;

const secondaryNav = [
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Segments", href: "/segments", icon: Layers },
  { name: "Templates", href: "/templates", icon: FileText },
  { name: "Campaigns", href: "/campaigns", icon: Mail },
  { name: "Automations", href: "/automations", icon: Sparkles },
  { name: "Forms", href: "/forms", icon: MousePointerClick },
  { name: "Brand Voice", href: "/intelligence/brand", icon: Brain },
  { name: "Conversations", href: "/conversations", icon: MessageSquare },
  { name: "Integrations", href: "/integrations", icon: Store },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isOpen, close, collapsed, toggleCollapsed } = useMobileSidebar();
  const [moreOpen, setMoreOpen] = useState(true);

  // Fetch pending actions count for badge
  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const store = stores?.[0];
  const storeId = store?.id;
  const onboardingDone = !!store?.onboardingCompletedAt;
  const { data: activationData } = (trpc.stores.activationStatus as any).useQuery(
    { storeId: storeId ?? "" },
    { enabled: !!storeId && onboardingDone, refetchInterval: 30000 },
  ) as { data: any | undefined };
  const pendingCount = onboardingDone ? (activationData?.context?.pendingActions ?? 0) : 0;

  // Auto-open "More" if current page is in secondary nav
  const isSecondaryActive = secondaryNav.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  if (isSecondaryActive && !moreOpen) {
    // Use effect-free approach: just show it expanded
  }

  const initials = user
    ? (user.firstName?.[0] || "") + (user.lastName?.[0] || "") ||
      user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() ||
      "U"
    : "U";

  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings" || pathname.startsWith("/settings/");
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={close}
        />
      )}

      <aside
        className={cn(
          "glass-sidebar border-r border-white/20 dark:border-white/10 flex flex-col transition-all duration-300",
          collapsed ? "w-[60px] overflow-visible" : "w-60",
          "hidden md:flex",
          isOpen && "fixed inset-y-0 left-0 z-50 flex !w-60"
        )}
      >
        {/* Logo */}
        <div className={cn("border-b border-white/15 dark:border-white/10", collapsed ? "px-3 py-5" : "px-6 py-5")}>
          {collapsed ? (
            <h1 className="text-[16px] font-bold text-foreground font-serif tracking-[-0.5px] text-center">A</h1>
          ) : (
            <>
              <h1 className="text-[18px] font-bold text-foreground font-serif tracking-[-0.5px]">
                AlloHQ
              </h1>
              <p className="text-[9px] text-muted-foreground font-sans tracking-[1px] uppercase mt-0.5">
                Your retention, handled
              </p>
            </>
          )}
        </div>

        {/* Primary Navigation */}
        <nav className={cn("pt-4 pb-2 space-y-0.5", collapsed ? "px-1.5" : "px-3")}>
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={close}
                className={cn(
                  "group/tooltip flex items-center rounded-xl transition-all text-[13px] font-sans py-2.5 relative",
                  collapsed ? "justify-center px-2" : "gap-3 px-3",
                  active
                    ? "bg-white/40 dark:bg-white/10 text-foreground font-semibold border-l-[3px] border-l-[var(--color-accent)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/20 dark:hover:bg-white/10"
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="flex-1">{item.name}</span>}
                {collapsed && (
                  <span className="absolute left-full ml-2 px-2.5 py-1 rounded-lg text-[11px] font-sans font-medium whitespace-nowrap bg-foreground text-background shadow-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity duration-150 z-50">
                    {item.name}
                  </span>
                )}
                {"showBadge" in item && item.showBadge && pendingCount > 0 && (
                  collapsed ? (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-[9px] font-bold px-0.5">
                      {pendingCount}
                    </span>
                  ) : (
                    <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold px-1">
                      {pendingCount}
                    </span>
                  )
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className={cn("border-t border-white/15 dark:border-white/10", collapsed ? "mx-2" : "mx-5")} />

        {/* More section */}
        <div className={cn("py-2", collapsed ? "px-1.5" : "px-3")}>
          {!collapsed && (
            <button
              onClick={() => setMoreOpen(!moreOpen)}
              className="flex items-center gap-3 w-full rounded-xl px-3 py-2 text-[12px] font-sans text-muted-foreground hover:text-foreground hover:bg-white/20 dark:hover:bg-white/10 transition-all"
            >
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 transition-transform duration-200",
                  (moreOpen || isSecondaryActive) && "rotate-180"
                )}
              />
              <span>More</span>
            </button>
          )}

          <AnimatePresence initial={false}>
            {(collapsed || moreOpen || isSecondaryActive) && (
              <motion.div
                initial={false}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={collapsed ? "" : "overflow-hidden"}
              >
                <div className="space-y-0.5 pt-1">
                  {secondaryNav.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={close}
                        className={cn(
                          "group/tooltip flex items-center rounded-xl transition-all text-[12px] font-sans relative",
                          collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                          active
                            ? "bg-white/30 dark:bg-white/10 text-foreground font-semibold border-l-[3px] border-l-[var(--color-accent)]"
                            : "text-muted-foreground/80 hover:text-foreground hover:bg-white/15 dark:hover:bg-white/8"
                        )}
                      >
                        <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {!collapsed && <span>{item.name}</span>}
                        {collapsed && (
                          <span className="absolute left-full ml-2 px-2.5 py-1 rounded-lg text-[11px] font-sans font-medium whitespace-nowrap bg-foreground text-background shadow-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity duration-150 z-50">
                            {item.name}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User section */}
        <div className={cn("py-3 border-t border-white/15 dark:border-[rgba(200,180,150,0.08)]", collapsed ? "px-1.5" : "px-3")}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground font-sans">
                  {initials}
                </div>
              )}
              <button
                onClick={toggleCollapsed}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/15 dark:hover:bg-[rgba(200,180,150,0.08)] transition-colors hidden md:block"
                title="Expand sidebar"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => signOut({ redirectUrl: "/sign-in" })}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/15 dark:hover:bg-[rgba(200,180,150,0.08)] transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground font-sans">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-foreground font-sans truncate">
                  {user?.fullName || user?.emailAddresses[0]?.emailAddress || "User"}
                </p>
                <p className="text-[10px] text-muted-foreground font-sans truncate">
                  {user?.emailAddresses[0]?.emailAddress || ""}
                </p>
              </div>
              <button
                onClick={toggleCollapsed}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/15 dark:hover:bg-[rgba(200,180,150,0.08)] transition-colors hidden md:flex"
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => signOut({ redirectUrl: "/sign-in" })}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/15 dark:hover:bg-[rgba(200,180,150,0.08)] transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
