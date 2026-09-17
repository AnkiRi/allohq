import type { ReactNode } from "react";
import { cn } from "@allohq/ui";

export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
    <div>{eyebrow && <p className="mb-2 font-mono text-[12px] uppercase tracking-[0.15em] text-[var(--attention)]">{eyebrow}</p>}<h1 className="app-page-title">{title}</h1>{description && <p className="mt-2 max-w-3xl text-[14px] leading-6 text-muted-foreground">{description}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </header>;
}

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("app-surface", className)}>{children}</section>;
}

export function MetricStrip({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return <section className={cn("grid border-y border-border", items.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3", className)} aria-label="Summary metrics">
    {items.map((item, index) => <div key={item.label} className={cn("py-4", index % 2 === 1 && "border-l border-border pl-5", index >= 2 && "border-t border-border sm:border-t-0", index > 0 && "sm:border-l sm:border-border sm:pl-5")}><p className="text-[12px] text-muted-foreground">{item.label}</p><p className="mt-1 text-[24px] font-medium tracking-[-0.03em]">{item.value}</p></div>)}
  </section>;
}
