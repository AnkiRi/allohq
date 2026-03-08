"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  Brain,
  Layers,
  Mail,
  FileText,
  Sparkles,
  BarChart3,
  Settings,
  Store,
  LogOut,
  Zap,
  MessageSquare,
  Shield,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { useMobileSidebar } from "./MobileSidebarContext";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Segments", href: "/segments", icon: Layers },
  { name: "Intelligence", href: "/intelligence", icon: Brain },
  { name: "Templates", href: "/templates", icon: FileText },
  { name: "Campaigns", href: "/campaigns", icon: Mail },
  { name: "Actions", href: "/actions", icon: ListChecks },
  { name: "Automations", href: "/automations", icon: Sparkles },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Agent", href: "/agent", icon: Zap },
  { name: "Conversations", href: "/conversations", icon: MessageSquare },
  { name: "Integrations", href: "/integrations", icon: Store },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Autonomy", href: "/settings/autonomy", icon: Shield, parent: "Settings" },
  { name: "Guardrails", href: "/settings/guardrails", icon: ShieldCheck, parent: "Settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isOpen, close } = useMobileSidebar();

  const initials = user
    ? (user.firstName?.[0] || "") + (user.lastName?.[0] || "") ||
      user.emailAddresses[0]?.emailAddress?.[0]?.toUpperCase() ||
      "U"
    : "U";

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
          "w-60 bg-[#EDE7DB]/80 backdrop-blur-glass border-r border-white/20 flex flex-col",
          // Desktop: always visible
          "hidden md:flex",
          // Mobile: full-screen overlay when open
          isOpen && "fixed inset-y-0 left-0 z-50 flex"
        )}
      >
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/20">
        <h1 className="text-[18px] font-bold text-foreground font-mono tracking-[-0.5px]">
          ALLOHQ
        </h1>
        <p className="text-[9px] text-muted-foreground font-mono tracking-[1px] uppercase mt-0.5">
          MARKETING AUTOMATION
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/settings" && pathname.startsWith(item.href + "/"));
          const isSettingsActive = item.href === "/settings" && pathname === "/settings";
          const isChild = "parent" in item;
          // Only show child items when parent section is active
          if (isChild && !pathname.startsWith("/settings")) return null;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={close}
              className={cn(
                "flex items-center gap-3 rounded-lg transition-all text-[13px] font-mono active:scale-[0.97]",
                isChild ? "px-3 py-1.5 pl-10 text-[11px]" : "px-3 py-2.5",
                isActive || isSettingsActive
                  ? "bg-white/40 text-foreground font-semibold border-l-[3px] border-l-terracotta"
                  : "text-muted-foreground hover:text-foreground hover:bg-terracotta-light"
              )}
            >
              <item.icon className={cn("w-4 h-4", isChild && "w-3.5 h-3.5")} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-white/20">
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
