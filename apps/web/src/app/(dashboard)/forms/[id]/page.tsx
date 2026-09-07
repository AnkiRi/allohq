"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  MousePointerClick,
  Calendar,
  User,
  Eye,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

function triggerLabel(trigger: string) {
  switch (trigger) {
    case "exit_intent": return "Exit Intent";
    case "scroll": return "Scroll";
    case "timer": return "Timer";
    case "page_load": return "Page Load";
    default: return trigger;
  }
}

export default function FormDetailPage() {
  const params = useParams();
  const formId = params?.id as string;
  const [tab, setTab] = useState<"submissions" | "storefront">("submissions");

  const { data: stores } = (trpc as any).stores.list.useQuery();
  const store = stores?.[0];
  const storeId = store?.id as string | undefined;

  const { data: form, isLoading } = (trpc as any).forms.getForm.useQuery(
    { formId },
    { enabled: !!formId }
  );

  const { data: submissions } = (trpc as any).forms.listSubmissions.useQuery(
    { formId, limit: 50 },
    { enabled: !!formId && tab === "submissions" }
  );

  const { data: stats } = (trpc as any).forms.submissionStats.useQuery(
    { formId },
    { enabled: !!formId }
  );

  const { data: embedData } = (trpc as any).forms.getEmbedCode.useQuery(
    { storeId: storeId ?? "" },
    { enabled: !!storeId && tab === "storefront" }
  );

  const utils = trpc.useUtils();
  const updateMut = (trpc as any).forms.updateForm.useMutation({
    onSuccess: () => (utils as any).forms.getForm.invalidate(),
  });
  const deletePopupMut = (trpc as any).forms.deletePopup.useMutation({
    onSuccess: () => (utils as any).forms.getForm.invalidate(),
  });
  const updatePopupMut = (trpc as any).forms.updatePopup.useMutation({
    onSuccess: () => (utils as any).forms.getForm.invalidate(),
  });

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fields = (form.fields as any[]) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Link
            href="/forms"
            className="inline-flex items-center gap-2 text-[11px] text-muted-foreground font-sans hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Forms
          </Link>
          <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            {form.name}
          </h1>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase ${
                form.status === "active"
                  ? "bg-[hsl(var(--success))/0.12] text-[var(--color-success)] border border-[hsl(var(--success))/0.25]"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {form.status}
            </span>
            <span className="text-[11px] text-muted-foreground font-sans">
              {fields.length} fields
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {form.status !== "active" && (
            <button
              onClick={() => updateMut.mutate({ formId, status: "active" as const })}
              className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-[11px] font-sans font-bold hover:opacity-90 transition-opacity"
            >
              Activate
            </button>
          )}
          {form.status === "active" && (
            <button
              onClick={() => updateMut.mutate({ formId, status: "draft" as const })}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-[11px] font-sans text-foreground hover:border-foreground/30 transition-colors"
            >
              Deactivate
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "POPUP VIEWS", value: stats?.impressions ?? 0, icon: Eye },
          { label: "SIGNUPS", value: stats?.total ?? 0, icon: MousePointerClick },
          { label: "SIGNUP RATE", value: stats?.signupRate == null ? "—" : `${(stats.signupRate * 100).toFixed(1)}%`, icon: Calendar },
          { label: "INCENTIVES", value: stats?.incentives ?? 0, icon: Calendar },
          { label: "PURCHASES", value: stats?.converted ?? 0, icon: User },
          { label: "ASSOCIATED REVENUE", value: stats ? stats.attributedRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0", icon: ArrowUpRight },
        ].map((stat) => (
          <div
            key={stat.label}
            className="p-4 bg-card border border-border rounded-xl"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px]">
                {stat.label}
              </span>
              <stat.icon className="w-4 h-4 text-muted-foreground/50" />
            </div>
            <div className="text-[28px] font-bold text-foreground font-mono tabular-nums">
              {typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">
        {stats?.attributionLabel ?? "Purchases are associated after Shopify reports the order."}
        {stats?.attributedDiscount > 0 ? ` · ${stats.attributedDiscount.toLocaleString()} in redeemed signup discounts.` : ""}
      </p>

      {/* Popups */}
      {form.popups && form.popups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[11px] font-serif font-bold text-muted-foreground uppercase tracking-[1px]">
            Popups
          </h2>
          <div className="grid gap-2">
            {form.popups.map((popup: any) => (
              <div
                key={popup.id}
                className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="text-[13px] font-sans font-medium text-foreground">
                      {popup.name}
                    </span>
                    <span className="ml-2 text-[10px] font-sans text-muted-foreground">
                      {triggerLabel(popup.trigger)}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-sans font-bold uppercase ${
                      popup.status === "active"
                        ? "bg-[hsl(var(--success))/0.12] text-[var(--color-success)] border border-[hsl(var(--success))/0.25]"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {popup.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updatePopupMut.mutate({ popupId: popup.id, status: popup.status === "active" ? "paused" : "active" })}
                    disabled={form.status !== "active" || updatePopupMut.isPending}
                    className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    title={form.status !== "active" ? "Activate the form first" : undefined}
                  >
                    {popup.status === "active" ? "Pause" : "Activate"}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this popup? This can't be undone.")) {
                        deletePopupMut.mutate({ popupId: popup.id });
                      }
                    }}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {form.experiments?.length > 0 && <section className="space-y-3">
        <h2 className="text-[11px] font-serif font-bold text-muted-foreground uppercase tracking-[1px]">Popup experiments</h2>
        <div className="grid gap-3 lg:grid-cols-2">{form.experiments.map((experiment:any)=><div key={experiment.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between"><div><p className="text-[13px] font-semibold">{experiment.name}</p><p className="text-[10px] uppercase tracking-[1px] text-muted-foreground">{experiment.status}</p></div><span className="text-[11px] text-muted-foreground">{experiment.exposures.length} assigned</span></div>
          <div className="mt-4 grid grid-cols-3 gap-2">{(["CONTROL","A","B"] as const).map(variant=>{const rows=experiment.exposures.filter((row:any)=>row.variant===variant);const signups=rows.filter((row:any)=>row.submittedAt).length;const purchases=rows.filter((row:any)=>row.convertedAt).length;return <div key={variant} className="rounded-lg bg-muted/60 p-3"><p className="text-[10px] font-bold">{variant}</p><p className="mt-1 font-mono text-lg">{rows.length?`${(signups/rows.length*100).toFixed(1)}%`:"—"}</p><p className="text-[10px] text-muted-foreground">signup · {purchases} buys</p></div>})}</div>
          <p className="mt-3 text-[10px] text-muted-foreground">{experiment.exposures.filter((row:any)=>row.variant==="CONTROL").length>=100?"Directional randomized evidence":"Early data — wait for 100 control assignments before choosing a winner."}</p>
        </div>)}</div>
      </section>}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["submissions", "storefront"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[11px] font-sans font-bold uppercase tracking-[1px] border-b-2 transition-colors ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "submissions" ? "Submissions" : "Storefront setup"}
          </button>
        ))}
      </div>

      {/* Submissions Tab */}
      {tab === "submissions" && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {!submissions || submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl">
              <MousePointerClick className="w-8 h-8 text-muted-foreground/50 mb-3" />
              <p className="text-[13px] text-muted-foreground">
                No sign-ups yet. They&apos;ll show up here as people opt in.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
                      Date
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
                      Customer
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
                      Source
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
                      Data
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
                      Consent
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((sub: any) => (
                    <motion.tr
                      key={sub.id}
                      variants={itemVariants}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-[12px] font-mono text-foreground">
                        {new Date(sub.capturedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {sub.customer ? (
                          <div className="flex items-center gap-2">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[12px] font-mono text-foreground">
                              {sub.customer.email}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[12px] font-sans text-muted-foreground">
                            Anonymous
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-muted border border-border">
                          {sub.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground max-w-[200px] truncate">
                        {JSON.stringify(sub.data)}
                      </td>
                      <td className="px-4 py-3">
                        {sub.consentGiven ? (
                          <div className="flex gap-1">
                            {Object.entries(sub.consentGiven as Record<string, boolean>).map(
                              ([ch, val]) =>
                                val ? (
                                  <span
                                    key={ch}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[hsl(var(--success))/0.12] text-[var(--color-success)] border border-[hsl(var(--success))/0.25]"
                                  >
                                    {ch}
                                  </span>
                                ) : null
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-mono text-muted-foreground">·</span>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {tab === "storefront" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-[14px] font-semibold text-foreground">Enable signup forms in your Shopify theme</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
            Joon uses a Shopify theme app embed. It does not edit theme code. Open the editor,
            switch on “Signup forms,” and save. Joon will detect the first storefront load.
          </p>
          {embedData?.activationUrl ? (
            <a href={embedData.activationUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-[12px] font-bold text-background">
              Open theme editor <ArrowUpRight className="size-3.5" />
            </a>
          ) : (
            <p className="mt-4 text-[12px] text-muted-foreground">Activate a popup first, then return here.</p>
          )}
        </div>
      )}
    </div>
  );
}
