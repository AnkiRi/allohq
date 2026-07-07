"use client";

import { trpc } from "@/lib/trpc";
import { ConsoleFrame } from "@/components/console";

// ---------------------------------------------------------------------------
// Growth intelligence — "do MORE by sending LESS", made legible.
//
// The holdout isn't the pitch; it's the training signal underneath. What the
// founder (and a VC) sees here is the DECISION it produces: allo sends where a
// control group PROVES incremental lift, and holds back where it doesn't (the
// loyalists who'd have bought anyway) — same revenue, fewer sends, a channel
// that stays worth opening.
//
// Every number comes from analytics.camImpact — the same real machinery as the
// control comparison below, grouped per segment. The send/hold call is DERIVED
// from each segment's measured significance, never asserted beyond it. On demo
// data the figures are labelled illustrative.
// ---------------------------------------------------------------------------

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(n));
const num = (n: number) => n.toLocaleString("en-IN");

type Campaign = {
  campaignId: string;
  name: string;
  segment: string | null;
  heldBack: number;
  messaged: number;
  liftPerCustomer: number;
  ciLow: number;
  ciHigh: number;
  significant: boolean;
  underpowered: boolean;
  decision: "send" | "hold" | "learning";
};
type CamImpact = {
  hasData: boolean;
  basis: "margin" | "revenue";
  campaigns: Campaign[];
  total: {
    campaigns: number;
    sendSegments: number;
    holdSegments: number;
    messaged: number;
    heldToMeasure: number;
    provenIncremental: number;
    sendsAvoidable: number;
    sendsAvoidablePct: number;
    baseMonthly: number;
    performanceFee: number;
    totalFee: number;
  };
};

function DecisionBadge({ decision }: { decision: Campaign["decision"] }) {
  if (decision === "send") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[hsl(var(--accent))] whitespace-nowrap">
        <span aria-hidden>▸</span> send
      </span>
    );
  }
  if (decision === "hold") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
        <span aria-hidden>⏸</span> hold back
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-500 whitespace-nowrap">
      <span aria-hidden>·</span> learning
    </span>
  );
}

export function GrowthImpactPanel({ storeId, windowDays }: { storeId: string; windowDays: number }) {
  const { data } = (trpc.analytics.camImpact as any).useQuery(
    { storeId, days: windowDays },
    { enabled: !!storeId },
  ) as { data: CamImpact | undefined };

  if (!data || !data.hasData) return null;
  const t = data.total;
  const calibrated = data.campaigns.filter((c) => !c.underpowered).length;

  return (
    <ConsoleFrame title="allo · growth intelligence">
      <p className="font-mono text-[10.5px] text-muted-foreground mb-4">
        send where lift is proven · hold back where it isn&apos;t · {windowDays}-day window
      </p>

      {/* The thesis, stated once. */}
      <p className="font-serif text-[19px] tracking-[-0.01em] text-foreground leading-snug mb-1">
        Do more by sending less.
      </p>
      <p className="font-sans text-[12.5px] text-muted-foreground leading-relaxed mb-5">
        allo concentrated sends on the segments a held-out control proved would respond, and held
        back the ones that would have bought anyway.
      </p>

      {/* Roll-up readouts — the money row. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border-2 border-[hsl(var(--accent))]/55 bg-[hsl(var(--accent))]/[0.05] p-4">
          <div className="font-mono text-[10.5px] text-[hsl(var(--accent))] lowercase font-semibold mb-1.5">
            proven incremental ₹
          </div>
          <div className="font-mono text-[22px] tabular-nums text-foreground">{inr(t.provenIncremental)}</div>
          <div className="font-sans text-[11px] text-muted-foreground mt-1">
            from {t.sendSegments} of {t.campaigns} segments — the rest earned nothing extra
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="font-mono text-[10.5px] text-muted-foreground lowercase mb-1.5">sends allo would skip</div>
          <div className="font-mono text-[22px] tabular-nums text-foreground">{t.sendsAvoidablePct}%</div>
          <div className="font-sans text-[11px] text-muted-foreground mt-1">
            {num(t.sendsAvoidable)} of {num(t.messaged)} messages — no proven lift, so drop them
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="font-mono text-[10.5px] text-muted-foreground lowercase mb-1.5">held back to measure</div>
          <div className="font-mono text-[22px] tabular-nums text-foreground">{num(t.heldToMeasure)}</div>
          <div className="font-sans text-[11px] text-muted-foreground mt-1">
            the control cohort — how allo can prove lift instead of guessing
          </div>
        </div>
      </div>

      {/* Concentrated lift, per segment — the "which to send, which to skip" table. */}
      <div className="rounded-xl border border-border bg-background/40 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1.6fr_0.7fr_0.7fr_1fr_0.8fr] gap-2 px-4 py-2 border-b border-border">
          {["segment", "messaged", "held back", "lift / customer", "allo's call"].map((h) => (
            <span key={h} className="font-mono text-[10px] text-muted-foreground lowercase tracking-wide">
              {h}
            </span>
          ))}
        </div>
        <div className="divide-y divide-border">
          {data.campaigns.map((c) => (
            <div
              key={c.campaignId}
              className="grid grid-cols-2 sm:grid-cols-[1.6fr_0.7fr_0.7fr_1fr_0.8fr] gap-x-2 gap-y-1 px-4 py-3 items-baseline"
            >
              {/* segment */}
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <div className="font-sans text-[13px] text-foreground font-medium truncate">
                  {c.segment ?? c.name}
                </div>
                <div className="font-mono text-[10.5px] text-muted-foreground truncate sm:hidden">{c.name}</div>
              </div>
              {/* messaged */}
              <div className="font-mono text-[12px] text-foreground tabular-nums">
                <span className="sm:hidden text-muted-foreground text-[10px] mr-1">sent</span>
                {num(c.messaged)}
              </div>
              {/* held back */}
              <div className="font-mono text-[12px] text-muted-foreground tabular-nums">
                <span className="sm:hidden text-muted-foreground text-[10px] mr-1">held</span>
                {num(c.heldBack)}
              </div>
              {/* lift */}
              <div className="font-mono text-[12px] tabular-nums">
                <span
                  className={
                    c.decision === "send" ? "text-[hsl(var(--accent))] font-semibold" : "text-foreground"
                  }
                >
                  {c.liftPerCustomer >= 0 ? "+" : ""}
                  {inr(c.liftPerCustomer)}
                </span>
                <span className="hidden sm:inline text-muted-foreground text-[10.5px]">
                  {" "}
                  · CI {inr(c.ciLow)}…{inr(c.ciHigh)}
                </span>
              </div>
              {/* call */}
              <div className="col-span-2 sm:col-span-1">
                <DecisionBadge decision={c.decision} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Getting sharper — honest confidence state, not a fake CAM % bar. */}
      <p className="font-sans text-[11px] text-muted-foreground mt-4 leading-relaxed">
        {calibrated} of {t.campaigns} segments now control-backed. As allo runs more cycles, the
        calls get sharper — every holdout adds to what it knows about who to send and who to skip.
      </p>

      <p className="font-sans text-[11px] text-muted-foreground/70 italic mt-2">
        Demo data — figures illustrative while control measurement accrues; the send/hold call is
        computed live from each segment&apos;s measured lift.
      </p>
    </ConsoleFrame>
  );
}
