"use client";

import Link from "next/link";
import { FileText, FormInput, Network, Palette, Sparkles } from "lucide-react";

const workspaces = [
  {
    title: "Email library",
    description: "Find, review and edit reusable email templates without losing campaign or automation context.",
    href: "/templates",
    action: "Open library",
    icon: FileText,
  },
  {
    title: "Brand voice",
    description: "Review the language, tone and guardrails Joon uses when it writes for your store.",
    href: "/intelligence/brand",
    action: "Review voice",
    icon: Palette,
  },
  {
    title: "Product graph",
    description: "See the product relationships Joon uses for relevant new-arrival, cross-sell and replenishment decisions.",
    href: "/intelligence/products",
    action: "Inspect graph",
    icon: Network,
  },
  {
    title: "Forms",
    description: "Manage the forms that bring new subscribers and their consent into Joon.",
    href: "/forms",
    action: "Manage forms",
    icon: FormInput,
  },
];

export default function BrandContentPage() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-7">
      <header className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--attention)]">Brand & content</p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-foreground">Everything behind on-brand retention work</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Start here to reach the dedicated workspaces for voice, reusable content, forms and product context. Campaigns and automations continue to own approval and delivery.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Brand and content workspaces">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;
          return (
            <article key={workspace.href} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--attention-soft)] text-[var(--attention)]"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><h2 className="text-lg font-medium text-foreground">{workspace.title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{workspace.description}</p><Link href={workspace.href} className="mt-4 inline-flex text-sm font-medium text-[var(--attention)] hover:underline">{workspace.action} →</Link></div>
              </div>
            </article>
          );
        })}
      </section>

      <aside className="rounded-xl border border-border bg-muted p-5">
        <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--attention)]" /><div><h2 className="text-sm font-medium text-foreground">Connected context, durable outputs</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Changes made inside the linked brand and product workspaces affect future drafts. They do not silently rewrite approved or sent work; those remain durable records in Campaigns, Automations and Activity.</p></div></div>
      </aside>
    </main>
  );
}
