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
  Brain,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { useMobileSidebar } from "./MobileSidebarContext";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";

const primaryNav = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Actions", href: "/actions", icon: ListChecks, showBadge: true },
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
  const { isOpen, close } = useMobileSidebar();
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
          "w-60 glass-sidebar border-r border-white/20 flex flex-col",
          "hidden md:flex",
          isOpen && "fixed inset-y-0 left-0 z-50 flex"
        )}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/15">
          <h1 className="text-[18px] font-bold text-foreground font-serif tracking-[-0.5px]">
            AlloHQ
          </h1>
          <p className="text-[9px] text-muted-foreground font-mono tracking-[1px] uppercase mt-0.5">
            AI Retention Team
          </p>
        </div>

        {/* Primary Navigation */}
        <nav className="px-3 pt-4 pb-2 space-y-0.5">
          {primaryNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={close}
                className={cn(
                  "flex items-center gap-3 rounded-xl transition-all text-[13px] font-mono px-3 py-2.5",
                  active
                    ? "bg-white/40 text-foreground font-semibold border-l-[3px] border-l-[var(--color-accent)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/20"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.name}</span>
                {"showBadge" in item && item.showBadge && pendingCount > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold px-1">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-5 border-t border-white/15" />

        {/* More section */}
        <div className="px-3 py-2">
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className="flex items-center gap-3 w-full rounded-xl px-3 py-2 text-[12px] font-mono text-muted-foreground hover:text-foreground hover:bg-white/20 transition-all"
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-200",
                (moreOpen || isSecondaryActive) && "rotate-180"
              )}
            />
            <span>More</span>
          </button>

          <AnimatePresence initial={false}>
            {(moreOpen || isSecondaryActive) && (
              <motion.div
                initial={false}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
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
                          "flex items-center gap-3 rounded-xl transition-all text-[12px] font-mono px-3 py-2",
                          active
                            ? "bg-white/30 text-foreground font-semibold border-l-[3px] border-l-[var(--color-accent)]"
                            : "text-muted-foreground/80 hover:text-foreground hover:bg-white/15"
                        )}
                      >
                        <item.icon className="w-3.5 h-3.5" />
                        <span>{item.name}</span>
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
        <div className="px-3 py-4 border-t border-white/15">
          <div className="flex items-center gap-3 px-3 py-2.5">
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt=""
                className="w-7 h-7 rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground font-mono">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-foreground font-mono truncate">
                {user?.fullName || user?.emailAddresses[0]?.emailAddress || "User"}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono truncate">
                {user?.emailAddresses[0]?.emailAddress || ""}
              </p>
            </div>
            <button
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
