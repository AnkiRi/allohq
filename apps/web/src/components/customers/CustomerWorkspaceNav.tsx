"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const views = [
  { href: "/customers", label: "Audience", description: "Everyone Joon can understand and reach", exact: true },
  { href: "/customers/states", label: "States", description: "How customer intent and purchase rhythm are changing" },
  { href: "/segments", label: "Segments", description: "Saved and generated customer groups" },
  { href: "/customers/left-alone", label: "Left alone", description: "Who Joon chose not to disturb, and why" },
  { href: "/intelligence/products", label: "Product graph", description: "Reorder, cross-sell and product relationships" },
];

const customerSectionRoutes = new Set(["/customers/states", "/customers/left-alone"]);

function isCustomerProfileRoute(pathname: string) {
  return /^\/customers\/[^/]+$/.test(pathname) && !customerSectionRoutes.has(pathname);
}

export function CustomerWorkspaceNav() {
  const pathname = usePathname();
  return <nav aria-label="Customer workspace" className="app-workspace-nav">{views.map((view) => { const profileRoute = view.href === "/customers" && isCustomerProfileRoute(pathname); const active = view.exact ? pathname === view.href || profileRoute : pathname === view.href || pathname.startsWith(`${view.href}/`); return <Link key={view.href} href={view.href} title={view.description} aria-label={`${view.label}. ${view.description}`} aria-current={active ? "page" : undefined} className="app-workspace-tab">{view.label}</Link>; })}</nav>;
}
