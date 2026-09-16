"use client";

import { useState } from "react";
import { GitBranch, RefreshCw, Check, Ban, Pin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { useAlloAI } from "@/components/ai/AlloAIPanel";

const TYPES = ["all", "cross_sell", "upsell", "replenishment", "bundle", "substitute"] as const;

export default function ProductGraphPage() {
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id;
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const { submit } = useAlloAI();
  const query = (trpc.productGraph.list as any).useQuery(
    { storeId: storeId ?? "", ...(type !== "all" ? { type } : {}) },
    { enabled: !!storeId }
  );
  const update = (trpc.productGraph.update as any).useMutation({
    onSuccess: () => utils.productGraph.list.invalidate(),
  });
  const rebuild = (trpc.productGraph.rebuild as any).useMutation({
    onSuccess: () => toast("Product graph rebuild queued.", "success"),
  });
  const rows = query.data ?? [];
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-decision">
            joon · merchandising intelligence
          </p>
          <h1 className="mt-1 text-[24px] font-serif font-semibold">Product graph</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            What customers buy together, what they buy next, when they replenish, and which upgrades
            you have approved.
          </p>
        </div>
        <button
          disabled={!storeId || rebuild.isPending}
          onClick={() => storeId && rebuild.mutate({ storeId })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh evidence
        </button>
      </header>
      <div className="flex flex-wrap gap-2">
        {TYPES.map((item) => (
          <button
            key={item}
            onClick={() => setType(item)}
            className={`rounded-full border px-3 py-1.5 text-xs ${type === item ? "border-foreground bg-foreground text-background" : "border-border bg-card"}`}
          >
            {item.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[1.4fr_32px_1.4fr_1fr_1fr_auto] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>From</span>
          <span></span>
          <span>To</span>
          <span>Relationship</span>
          <span>Evidence</span>
          <span>Review</span>
        </div>
        {query.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Building the map…</p>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <GitBranch className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No relationships learned yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Refresh after product and order sync. Catalog suggestions are labelled low confidence.
            </p>
          </div>
        ) : (
          rows.map((row: any) => (
            <div
              key={row.id}
              className="grid grid-cols-[1.4fr_32px_1.4fr_1fr_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-0"
            >
              <span className="text-sm font-medium">{row.source?.title ?? "Unknown product"}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-sm font-medium">{row.target?.title ?? "Unknown product"}</span>
              <div>
                <span className="rounded bg-muted px-2 py-1 text-[11px]">
                  {row.relationshipType.replace("_", " ")}
                </span>
                {row.medianLagDays != null && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    ~{Math.round(row.medianLagDays)} days
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs">{row.explanation}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {row.supportCount || "Catalog"} evidence · {Math.round(row.confidence * 100)}%
                  confidence
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  title="Approve"
                  onClick={() => update.mutate({ storeId, id: row.id, status: "approved" })}
                  className={`rounded p-1.5 ${row.status === "approved" ? "bg-outcome/15 text-outcome" : "hover:bg-muted"}`}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  title="Pin"
                  onClick={() => update.mutate({ storeId, id: row.id, pinned: !row.pinned })}
                  className={`rounded p-1.5 ${row.pinned ? "bg-decision/15 text-decision" : "hover:bg-muted"}`}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
                <button
                  title="Block"
                  onClick={() => update.mutate({ storeId, id: row.id, status: "blocked" })}
                  className={`rounded p-1.5 ${row.status === "blocked" ? "bg-destructive/10 text-destructive" : "hover:bg-muted"}`}
                >
                  <Ban className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() =>
                    submit(
                      `Create a campaign using the approved ${row.relationshipType.replace("_", " ")} from “${row.source?.title}” to “${row.target?.title}”. Preserve these products as structured constraints and let me review it.`
                    )
                  }
                  className="rounded border border-border px-2 py-1 text-[10px]"
                >
                  Use
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
