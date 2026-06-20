"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  ConsoleFrame,
  CommandLine,
  MetricReadout,
  formatINR,
} from "@/components/console";

// ---------------------------------------------------------------------------
// Segments — the operator's filter vocabulary. "All" means no segment filter.
// ---------------------------------------------------------------------------

const SEGMENTS = [
  "All",
  "Champions",
  "Loyal Customers",
  "Potential Loyalists",
  "New Customers",
  "At Risk",
  "Can't Lose Them",
  "Hibernating",
  "Lost",
];

// ---------------------------------------------------------------------------
// Command intent parsing — map a typed goal to the page's EXISTING filter
// state (segment filter + free-text search). Returns either a segment to
// select, or a search term to run. Falls back to free-text search.
// ---------------------------------------------------------------------------

type CommandIntent =
  | { kind: "segment"; segment: string }
  | { kind: "search"; term: string };

function parseCommand(raw: string): CommandIntent {
  const q = raw.toLowerCase().trim();

  // At-risk / churning cohorts → the At Risk segment.
  if (/\b(at[\s-]?risk|risk|slipping|churn|leaving|losing)\b/.test(q)) {
    return { kind: "segment", segment: "At Risk" };
  }

  // Lapsed / dormant / hasn't-bought → Hibernating.
  if (
    /\b(lapsed|dormant|inactive|hibernat|asleep|gone quiet|hasn'?t bought|haven'?t bought|90 days|six months)\b/.test(
      q,
    )
  ) {
    return { kind: "segment", segment: "Hibernating" };
  }

  // Lost / churned-out → Lost.
  if (/\b(lost|churned|left for good|never coming back)\b/.test(q)) {
    return { kind: "segment", segment: "Lost" };
  }

  // VIPs / best / top spenders → Champions.
  if (/\b(vip|vips|best|top|biggest spender|whales?|champion)\b/.test(q)) {
    return { kind: "segment", segment: "Champions" };
  }

  // Loyal / repeat / regulars → Loyal Customers.
  if (/\b(loyal|repeat|regulars?|faithful)\b/.test(q)) {
    return { kind: "segment", segment: "Loyal Customers" };
  }

  // New / first-timers → New Customers.
  if (/\b(new|first[\s-]?time|just joined|recent sign)\b/.test(q)) {
    return { kind: "segment", segment: "New Customers" };
  }

  // Anything else → free-text search on the typed value.
  return { kind: "search", term: raw.trim() };
}

function isInactiveCustomer(customer: {
  rfmScore?: { orderCount?: number; totalSpent?: number } | null;
  _count: { orders: number };
}): boolean {
  const orders = customer.rfmScore?.orderCount ?? customer._count.orders;
  const spent = customer.rfmScore?.totalSpent ?? 0;
  return orders === 0 && spent === 0;
}

// RFM total-score readout color — accent for strong, muted otherwise.
function rfmScoreClass(score: number | undefined | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 12) return "text-[hsl(var(--accent))]";
  if (score >= 8) return "text-foreground";
  return "text-muted-foreground";
}

// Wrapped in Suspense: useSearchParams (for /customers?segment= deep links from
// the segments page) requires a boundary to avoid a static-render bailout.
export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersConsole />
    </Suspense>
  );
}

function CustomersConsole() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("All");
  const [page, setPage] = useState(1);
  // Last command echoed back into the console, for the operator's record.
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  // Deep-link from the segments page (/customers?segment=<name>): apply the
  // incoming segment filter once it resolves to a known cohort.
  useEffect(() => {
    const incoming = searchParams.get("segment");
    if (incoming && SEGMENTS.includes(incoming)) {
      setSegment(incoming);
      setSearch("");
      setPage(1);
    }
  }, [searchParams]);

  const { data: stats } = trpc.customers.stats.useQuery();
  const { data, isLoading } = trpc.customers.list.useQuery({
    page,
    limit: 20,
    search: search || undefined,
    segment: segment === "All" ? undefined : segment,
  });

  // The number of at-risk customers in the base, for the status line.
  const { data: distribution } = trpc.segments.distribution.useQuery();
  const atRiskCount =
    (distribution as { segment: string; customerCount: number }[] | undefined)
      ?.filter((d) => d.segment === "At Risk" || d.segment === "Hibernating")
      .reduce((sum, d) => sum + d.customerCount, 0) ?? 0;

  // ---- Command line → existing search / segment-filter state ----
  const handleCommand = (value: string) => {
    const intent = parseCommand(value);
    setLastCommand(value);
    setPage(1);
    if (intent.kind === "segment") {
      setSegment(intent.segment);
      setSearch("");
    } else {
      setSearch(intent.term);
      setSegment("All");
    }
  };

  const totalInBase = stats?.totalCustomers ?? 0;
  const marketingRate = stats ? `${stats.marketingRate.toFixed(0)}%` : "—";

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      {/* Heading — prose, no motion */}
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground font-serif">
          Who
        </h1>
        <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
          Everyone who&apos;s shopped with you, and where they stand. Ask allo to
          pull up the cohort you care about.
        </p>
      </div>

      {/* Command line — querying the customer base */}
      <CommandLine
        placeholder={[
          "show me at-risk customers",
          "who hasn't bought in 90 days?",
          "find my VIPs",
          "search by name or email",
        ]}
        onSubmit={handleCommand}
      />

      {/* The base, framed in the console */}
      <ConsoleFrame title="allo — customer base">
        {/* Status line — mono readouts. Who-of-the-base first, money second,
            split by a hairline so the two groups read as distinct. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-4 mb-4 border-b border-border">
          <MetricReadout label="customers" value={totalInBase} live />
          {/* "at risk" is the one number worth acting on — accent it when real */}
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] whitespace-nowrap">
            <span className="text-muted-foreground">at risk</span>
            <span
              className={`tabular-nums font-medium ${
                atRiskCount > 0
                  ? "text-[hsl(var(--accent))]"
                  : "text-foreground"
              }`}
            >
              {atRiskCount.toLocaleString("en-IN")}
            </span>
          </span>
          <MetricReadout label="opt-in" value={marketingRate} />
          {stats && (
            <span
              aria-hidden="true"
              className="hidden sm:inline-block w-px h-3.5 bg-border"
            />
          )}
          {stats && (
            <MetricReadout label="revenue" value={stats.totalRevenue} money />
          )}
          {stats && (
            <MetricReadout label="avg order" value={stats.avgOrderValue} money />
          )}
        </div>

        {/* Command echo — confirms allo understood the last typed goal. Its own
            line so it never collides with or gets clipped by the filter state. */}
        {lastCommand && (
          <div className="font-mono text-[11.5px] text-muted-foreground mb-2 truncate">
            <span className="text-[hsl(var(--accent))]">allo ›</span>{" "}
            {lastCommand}
          </div>
        )}

        {/* Active filter line — what allo is showing right now (operator voice) */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="font-mono text-[12px] text-muted-foreground">
            showing
          </span>
          <span className="font-mono text-[12px] text-foreground">
            {segment === "All" ? "all customers" : segment.toLowerCase()}
            {search ? ` · matching "${search}"` : ""}
          </span>
          {data && (
            <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
              · {data.total.toLocaleString("en-IN")} found
            </span>
          )}
        </div>

        {/* Segment filter — operator chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-4">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSegment(s);
                setSearch("");
                setPage(1);
              }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-md font-mono text-[11px] lowercase transition-colors ${
                segment === s
                  ? "border border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/[0.06] text-[hsl(var(--accent))]"
                  : "border border-border bg-background/40 text-muted-foreground hover:border-muted-foreground/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Customer table */}
        <div className="overflow-hidden rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-background/40">
                <th className="text-left px-5 py-3 font-mono text-[10px] tracking-[0.5px] text-muted-foreground lowercase">
                  customer
                </th>
                <th className="text-left px-5 py-3 font-mono text-[10px] tracking-[0.5px] text-muted-foreground lowercase">
                  segment
                </th>
                <th className="text-right px-5 py-3 font-mono text-[10px] tracking-[0.5px] text-muted-foreground lowercase">
                  orders
                </th>
                <th className="text-right px-5 py-3 font-mono text-[10px] tracking-[0.5px] text-muted-foreground lowercase">
                  total spent
                </th>
                <th className="text-right px-5 py-3 font-mono text-[10px] tracking-[0.5px] text-muted-foreground lowercase">
                  rfm
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-5 py-4">
                      <div className="h-4 bg-muted/50 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : data?.customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center">
                    <Users className="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
                    <p className="text-[13px] text-foreground font-sans">
                      No one here to show.
                    </p>
                    <p className="text-[12px] text-muted-foreground font-sans mt-1">
                      Try a different cohort, or clear the search to see everyone.
                    </p>
                  </td>
                </tr>
              ) : (
                data?.customers.map((customer) => {
                  const inactive = isInactiveCustomer(customer);
                  return (
                    <tr
                      key={customer.id}
                      className={`transition-colors group relative hover:bg-background/40${
                        inactive ? " opacity-60" : ""
                      }`}
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground font-mono">
                            {(
                              customer.firstName?.[0] ??
                              customer.email[0] ??
                              "?"
                            ).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-[13px] font-medium text-foreground font-sans">
                              {customer.firstName} {customer.lastName}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {customer.email}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/customers/${customer.id}`}>
                          <span className="inline-block font-mono text-[11px] lowercase text-muted-foreground">
                            {customer.rfmScore?.segment ?? "—"}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-right text-[13px] font-mono tabular-nums text-foreground">
                        <Link href={`/customers/${customer.id}`} className="block">
                          {customer.rfmScore?.orderCount ??
                            customer._count.orders}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-right text-[13px] font-mono tabular-nums font-semibold text-foreground">
                        <Link href={`/customers/${customer.id}`} className="block">
                          {formatINR(customer.rfmScore?.totalSpent ?? 0)}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link href={`/customers/${customer.id}`} className="block">
                          <span
                            className={`inline-block font-mono text-[12px] tabular-nums font-semibold ${rfmScoreClass(
                              customer.rfmScore?.totalScore,
                            )}`}
                          >
                            {customer.rfmScore?.totalScore ?? "—"}
                          </span>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background/40">
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {data.total.toLocaleString("en-IN")} customers · page {data.page}{" "}
                of {data.pages}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded border border-border bg-background/40 hover:border-muted-foreground/40 disabled:opacity-30 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page === data.pages}
                  className="p-1.5 rounded border border-border bg-background/40 hover:border-muted-foreground/40 disabled:opacity-30 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}
        </div>
      </ConsoleFrame>
    </div>
  );
}
