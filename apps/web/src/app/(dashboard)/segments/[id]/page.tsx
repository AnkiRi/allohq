"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, Save, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * Segment detail — shows ANY segment's RESOLVED members (names/emails/spend),
 * regardless of how it's defined (explicit list / conditions / RFM), via
 * segments.getById. Name + description are editable; the count shown is the same
 * query that built it, so it always matches the preview.
 */
export default function SegmentDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const utils = trpc.useUtils();

  const { data, isLoading, error } = (trpc.segments.getById as any).useQuery(
    { id },
    { enabled: !!id },
  ) as { data: any; isLoading: boolean; error: unknown };

  const updateMut = (trpc.segments.update as any).useMutation({
    onSuccess: () => (utils.segments as any).getById.invalidate({ id }),
  }) as { mutate: (i: any, o?: any) => void; isPending: boolean };

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data?.segment) {
    return (
      <div className="max-w-md mx-auto py-32 text-center">
        <p className="text-[15px] font-serif font-semibold text-foreground mb-1">Segment not found</p>
        <Link href="/segments" className="text-[13px] text-[var(--color-accent)] hover:underline inline-flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to segments
        </Link>
      </div>
    );
  }

  const seg = data.segment;
  const members: any[] = data.members ?? [];
  const startEdit = () => {
    setName(seg.name);
    setDescription(seg.description ?? "");
    setEditing(true);
  };
  const save = () => updateMut.mutate({ id, name, description }, { onSuccess: () => setEditing(false) });

  const defn =
    seg.kind === "manual"
      ? `${(seg.customerIds || []).length} hand-picked customers`
      : seg.kind === "conditions"
        ? "rule-based (conditions)"
        : `RFM score ${seg.rfmMin}–${seg.rfmMax}`;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Link href="/segments" className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> segments
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[20px] font-serif font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What this segment represents…"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          ) : (
            <>
              <h1 className="text-[22px] font-serif font-semibold text-foreground tracking-[-0.01em]">{seg.name}</h1>
              {seg.description ? <p className="text-[13px] text-muted-foreground font-sans mt-1">{seg.description}</p> : null}
            </>
          )}
          <div className="mt-2 flex items-center gap-4 font-mono text-[11px] text-muted-foreground tabular-nums">
            <span><span className="text-foreground">{(data.count ?? 0).toLocaleString("en-IN")}</span> customers</span>
            <span>· {defn}</span>
          </div>
        </div>
        {editing ? (
          <button onClick={save} disabled={updateMut.isPending} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-sans font-medium text-white bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 transition-opacity">
            {updateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        ) : (
          <button onClick={startEdit} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-[12px] font-sans text-foreground hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </header>

      {/* Members */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Members {data.count > members.length ? `· showing first ${members.length} of ${data.count.toLocaleString("en-IN")}` : ""}
        </div>
        {members.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-muted-foreground font-sans">No customers match this segment.</div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.id} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                <div className="flex-1 min-w-0">
                  <div className="text-foreground font-sans truncate">{m.name}</div>
                  <div className="text-muted-foreground font-mono text-[11px] truncate">{m.email}</div>
                </div>
                {m.segment ? <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">{m.segment}</span> : null}
                <span className="font-mono text-[12px] text-foreground tabular-nums w-24 text-right">₹{Math.round(m.totalSpent ?? 0).toLocaleString("en-IN")}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums w-16 text-right hidden sm:inline">{m.orderCount ?? 0} ord</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
