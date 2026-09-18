"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@allohq/ui";

const views = [
  { href: "/customers", label: "Audience", exact: true },
  { href: "/customers/states", label: "States" },
  { href: "/segments", label: "Segments" },
  { href: "/customers/left-alone", label: "Left alone" },
  { href: "/intelligence/products", label: "Product graph" },
];

export function CustomerWorkspaceNav() {
  const pathname = usePathname();
  return <nav aria-label="Customer intelligence views" className="overflow-x-auto rounded-xl bg-[var(--surface-soft)] p-1"><div className="flex min-w-max gap-1">{views.map((view) => { const profileRoute = view.href === "/customers" && /^\/customers\/[^/]+$/.test(pathname); const active = view.exact ? pathname === view.href || profileRoute : pathname.startsWith(view.href); return <Link key={view.href} href={view.href} aria-current={active ? "page" : undefined} className={cn("rounded-lg px-3 py-2 text-[13px] font-medium transition-colors", active ? "bg-[var(--surface)] text-foreground shadow-sm" : "text-muted-foreground hover:bg-[var(--surface)]/65 hover:text-foreground")}>{view.label}</Link>; })}</div></nav>;
}
