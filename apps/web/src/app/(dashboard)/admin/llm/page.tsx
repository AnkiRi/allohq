"use client";

import { trpc } from "@/lib/trpc";

/**
 * Founder-only LLM cost + error console. The endpoint (ai.llmSpend) is owner-gated —
 * demo-guests and non-admins get FORBIDDEN, which renders the "owner-only" state here.
 */
export default function LlmSpendPage() {
  const { data, isLoading, error } = (trpc.ai.llmSpend as any).useQuery(undefined, {
    retry: false,
  }) as { data: any; isLoading: boolean; error: { message?: string } | null };

  if (isLoading) {
    return <div className="py-32 text-center text-[13px] text-muted-foreground font-sans">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="max-w-md mx-auto py-32 text-center">
        <p className="text-[15px] font-serif font-semibold text-foreground mb-1">Owner only</p>
        <p className="text-[13px] text-muted-foreground font-sans">This console is restricted to the workspace owner.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-[22px] font-serif font-semibold text-foreground tracking-[-0.01em]">LLM spend</h1>
        <p className="text-[13px] text-muted-foreground font-sans mt-1">Founder-only — real spend from measured token usage.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Today" value={`$${data.todayUsd.toFixed(2)}`} alert={data.threshold?.exceeded} />
        <Stat label="Last 7 days" value={`$${data.weekUsd.toFixed(2)}`} />
      </div>

      {data.threshold?.exceeded ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-400 font-sans">
          ⚠ Today's spend (${data.todayUsd.toFixed(2)}) exceeds the ${data.threshold.dailyUsd} daily threshold.
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          By model (7 days)
        </div>
        {data.byModel.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground font-sans">No usage yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.byModel.map((m: any) => (
              <div key={m.model} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                <span className="font-mono text-foreground flex-1 truncate">{m.model}</span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums hidden sm:inline">
                  {m.calls} calls · {(m.inputTokens / 1000).toFixed(0)}k→{(m.outputTokens / 1000).toFixed(0)}k
                </span>
                <span className="font-mono text-foreground tabular-nums w-16 text-right">${m.usd.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Recent errors
        </div>
        {data.recentErrors.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground font-sans">No recent errors.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.recentErrors.map((e: any, i: number) => (
              <div key={i} className="px-4 py-2.5 text-[12.5px] flex items-center gap-2">
                <span className="font-mono text-foreground">{e.actionType}</span>
                <span className="text-red-600 dark:text-red-400 font-sans truncate flex-1">{e.error}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border ${alert ? "border-red-500/40" : "border-border"} bg-card p-4`}>
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[24px] font-serif font-semibold text-foreground mt-1 tabular-nums">{value}</div>
    </div>
  );
}
