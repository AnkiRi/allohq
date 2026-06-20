"use client";

import { useState } from "react";
import {
  BarChart3,
  TrendingUp,
  Download,
  Loader2,
  Mail,
  MessageSquare,
  DollarSign,
  Users,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { SmartEmptyState } from "@/components/ui/SmartEmptyState";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageSquare,
  rcs: MessageSquare,
};

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState(30);
  const [tab, setTab] = useState<"overview" | "channels" | "ai" | "cohorts" | "roi" | "forecast">("overview");

  const { data: stores } = (trpc as any).stores.list.useQuery();
  const store = stores?.[0];
  const storeId = store?.id as string | undefined;

  // Queries
  const { data: channelData, isLoading: channelLoading } = (trpc as any).analytics.channelBreakdown.useQuery(
    { storeId: storeId ?? "", days: period },
    { enabled: !!storeId }
  );

  const { data: aiData, isLoading: aiLoading } = (trpc as any).analytics.aiPerformance.useQuery(
    { storeId: storeId ?? "", days: period },
    { enabled: !!storeId }
  );

  const { data: cohortData, isLoading: cohortLoading } = (trpc as any).analytics.cohorts.useQuery(
    { storeId: storeId ?? "" },
    { enabled: !!storeId && tab === "cohorts" }
  );

  const { data: roiData, isLoading: roiLoading } = (trpc as any).analytics.roi.useQuery(
    { storeId: storeId ?? "", days: period },
    { enabled: !!storeId }
  );

  const { data: revenueTimeline } = (trpc as any).analytics.revenueTimeline.useQuery(
    { storeId: storeId ?? "", days: String(period) },
    { enabled: !!storeId }
  );

  const { data: attributionData } = (trpc as any).analytics.attribution.useQuery(
    { storeId: storeId ?? "", days: period },
    { enabled: !!storeId && tab === "overview" }
  );

  const { data: forecastData, isLoading: forecastLoading } = (trpc as any).analytics.forecast.useQuery(
    { storeId: storeId ?? "" },
    { enabled: !!storeId && tab === "forecast" }
  ) as { data: any | undefined; isLoading: boolean };

  // Export handler
  const exportMut = (trpc as any).analytics.exportCsv.useQuery(
    { storeId: storeId ?? "", type: tab === "overview" ? "attribution" : tab === "channels" ? "channel" : tab === "ai" ? "comparison" : tab === "cohorts" ? "cohort" : "roi", days: period },
    { enabled: false }
  );

  const handleExport = async () => {
    const result = await exportMut.refetch();
    if (result.data?.csv) {
      downloadCsv(result.data.csv, `allo-analytics-${tab}-${period}d.csv`);
    }
  };

  if (!storeId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Compute summary stats
  const totalChannelRevenue = channelData?.reduce((s: number, c: any) => s + c.revenue, 0) ?? 0;
  const totalMessages = channelData?.reduce((s: number, c: any) => s + c.messageCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            Analytics
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            How your retention is performing, and where the revenue is coming from.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex bg-muted rounded-lg p-0.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={`px-3 py-1.5 text-[10px] font-mono font-bold rounded-md transition-colors ${
                  period === d
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-[10px] font-sans font-bold text-foreground hover:border-foreground/30 transition-colors"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>
      </div>

      {/* Top-level KPI cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-4 gap-4"
      >
        {[
          {
            label: "Attributed revenue",
            value: `₹${totalChannelRevenue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            icon: DollarSign,
          },
          {
            label: "Messages sent",
            value: totalMessages.toLocaleString(),
            icon: Mail,
          },
          {
            label: "AI ROI",
            value: roiData ? `${roiData.roi}x` : "—",
            icon: Zap,
          },
          {
            label: "AI revenue",
            value: roiData ? `₹${roiData.aiAttributedRevenue.toLocaleString("en-IN")}` : "—",
            icon: TrendingUp,
          },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            variants={itemVariants}
            className="p-4 bg-card border border-border rounded-xl"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px]">
                {stat.label}
              </span>
              <stat.icon className="w-4 h-4 text-muted-foreground/50" />
            </div>
            <div className="text-[24px] font-bold text-foreground font-mono tabular-nums">
              {stat.value}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Revenue Timeline */}
      {revenueTimeline?.points && revenueTimeline.points.length > 0 && (
        <motion.div variants={itemVariants} initial="hidden" animate="visible" className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[11px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
              Revenue Timeline
            </h2>
          </div>
          <div className="flex items-end gap-1 h-32">
            {(() => {
              const points = revenueTimeline.points as Array<{ date: string; value: number }>;
              const maxVal = Math.max(...points.map((p) => p.value), 1);
              return points.map((point: { date: string; value: number }, i: number) => (
                <div
                  key={i}
                  className="flex-1 bg-foreground/20 hover:bg-foreground/40 rounded-t transition-colors group relative"
                  style={{ height: `${(point.value / maxVal) * 100}%`, minHeight: "2px" }}
                  title={`${point.date}: ₹${point.value.toLocaleString("en-IN")}`}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-foreground text-background text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap">
                    ₹{point.value.toLocaleString("en-IN")}
                  </div>
                </div>
              ));
            })()}
          </div>
          <div className="flex justify-between mt-2 text-[9px] font-mono text-muted-foreground">
            <span>{(revenueTimeline.points as Array<{ date: string }>)[0]?.date}</span>
            <span>{(revenueTimeline.points as Array<{ date: string }>).at(-1)?.date}</span>
          </div>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          ["overview", "Attribution"],
          ["channels", "Channels"],
          ["ai", "AI vs Manual"],
          ["cohorts", "Cohorts"],
          ["roi", "ROI"],
          ["forecast", "Forecast"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-[11px] font-sans font-bold uppercase tracking-[1px] border-b-2 transition-colors ${
              tab === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible">

        {/* Attribution Tab */}
        {tab === "overview" && (
          <div className="space-y-4">
            {!attributionData || attributionData.length === 0 ? (
              <SmartEmptyState
                icon={BarChart3}
                title="Nothing to show just yet"
                description="As soon as your first campaign goes out, Allo starts tracking where revenue comes from, how each channel does, and how your customers are holding up."
                actions={[{ label: "See what's waiting", href: "/actions", primary: true }]}
              />
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {["Source", "Type", "Channel", "Revenue", "Orders"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(attributionData as any[]).map((row: any, i: number) => (
                      <motion.tr key={i} variants={itemVariants} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-3 text-[12px] font-sans font-medium text-foreground">{row.sourceName}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[9px] font-sans bg-muted border border-border uppercase">{row.sourceType}</span>
                        </td>
                        <td className="px-4 py-3 text-[12px] font-sans text-muted-foreground">{row.channel}</td>
                        <td className="px-4 py-3 text-[12px] font-mono font-bold text-foreground tabular-nums">₹{row.revenue.toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground tabular-nums">{row.orderCount}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Channels Tab */}
        {tab === "channels" && (
          <div className="space-y-4">
            {channelLoading ? (
              <Loading />
            ) : !channelData || channelData.length === 0 ? (
              <EmptyState icon={Mail} text="No channel data yet — it'll fill in once you've sent some messages." />
            ) : (
              <div className="grid gap-4">
                {(channelData as any[]).map((ch: any) => {
                  const Icon = channelIcons[ch.channel] ?? Mail;
                  return (
                    <motion.div key={ch.channel} variants={itemVariants} className="p-5 bg-card border border-border rounded-xl">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-[13px] font-sans font-bold text-foreground uppercase">{ch.channel}</span>
                        </div>
                        <span className="text-[18px] font-mono font-bold text-foreground tabular-nums">
                          ₹{ch.revenue.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        {[
                          { label: "Messages", value: ch.messageCount.toLocaleString() },
                          { label: "Open Rate", value: `${ch.openRate}%` },
                          { label: "Click Rate", value: `${ch.clickRate}%` },
                          { label: "Conv. Rate", value: `${ch.conversionRate}%` },
                        ].map((s) => (
                          <div key={s.label}>
                            <div className="text-[10px] font-sans text-muted-foreground uppercase">{s.label}</div>
                            <div className="text-[15px] font-mono font-bold text-foreground tabular-nums">{s.value}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AI vs Manual Tab */}
        {tab === "ai" && (
          <div className="space-y-4">
            {aiLoading ? (
              <Loading />
            ) : !aiData ? (
              <EmptyState icon={Zap} text="No campaigns to compare yet — send a few and we'll show AI against manual here." />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {([
                  { data: aiData.ai, label: "AI-Generated", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
                  { data: aiData.manual, label: "Manual", color: "text-foreground", bg: "bg-muted", border: "border-border" },
                ] as const).map((group) => (
                  <motion.div key={group.label} variants={itemVariants} className={`p-5 ${group.bg} border ${group.border} rounded-xl`}>
                    <h3 className={`text-[13px] font-sans font-bold ${group.color} mb-4`}>{group.label}</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Campaigns", value: String(group.data.campaignCount) },
                        { label: "Recipients", value: group.data.totalRecipients.toLocaleString() },
                        { label: "Open Rate", value: `${group.data.avgOpenRate}%` },
                        { label: "Click Rate", value: `${group.data.avgClickRate}%` },
                        { label: "Revenue", value: `₹${group.data.totalRevenue.toLocaleString("en-IN")}` },
                        { label: "Avg Rev/Campaign", value: `₹${group.data.avgRevenuePerCampaign.toLocaleString("en-IN")}` },
                      ].map((s) => (
                        <div key={s.label} className="flex items-center justify-between">
                          <span className="text-[11px] font-sans text-muted-foreground">{s.label}</span>
                          <span className="text-[13px] font-mono font-bold text-foreground tabular-nums">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cohorts Tab */}
        {tab === "cohorts" && (
          <div className="space-y-4">
            {cohortLoading ? (
              <Loading />
            ) : !cohortData || cohortData.length === 0 ? (
              <EmptyState icon={Users} text="No cohort data yet — this builds up as customers return over time." />
            ) : (
              <div className="border border-border rounded-xl overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">Cohort</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-sans font-bold text-muted-foreground uppercase tracking-[1px]">Size</th>
                      {Array.from({ length: 7 }, (_, i) => (
                        <th key={i} className="px-3 py-2.5 text-center text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-[1px]">
                          M{i}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(cohortData as any[]).map((cohort: any) => (
                      <tr key={cohort.cohortMonth} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-[12px] font-mono font-medium text-foreground">{cohort.cohortMonth}</td>
                        <td className="px-4 py-3 text-[12px] font-mono text-muted-foreground tabular-nums">{cohort.customerCount}</td>
                        {Array.from({ length: 7 }, (_, i) => {
                          const period = (cohort.periods as any[])?.find((p: any) => p.periodIndex === i);
                          const rate = period?.retentionRate ?? 0;
                          const intensity = Math.min(rate / 100, 1);
                          return (
                            <td
                              key={i}
                              className="px-3 py-3 text-center text-[11px] font-mono tabular-nums"
                              style={{
                                backgroundColor: rate > 0 ? `rgba(34, 197, 94, ${intensity * 0.3})` : undefined,
                                color: rate > 0 ? "#166534" : "#9ca3af",
                              }}
                            >
                              {rate > 0 ? `${rate}%` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ROI Tab */}
        {tab === "roi" && (
          <div className="space-y-4">
            {roiLoading ? (
              <Loading />
            ) : !roiData ? (
              <EmptyState icon={DollarSign} text="No ROI to show yet — once campaigns start earning, you'll see the return here." />
            ) : (
              <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
                {[
                  { label: "AI Token Cost", value: `$${roiData.aiTokenCost.toFixed(4)}`, sub: `${period} day period` },
                  { label: "AI Attributed Revenue", value: `₹${roiData.aiAttributedRevenue.toLocaleString("en-IN")}`, sub: "Campaigns + Automations" },
                  { label: "Return on Investment", value: `${roiData.roi}x`, sub: "(Revenue - Cost) / Cost" },
                  { label: "Activity", value: `${roiData.campaignsSent} campaigns, ${roiData.automationsSent} automations`, sub: `${period} day period` },
                ].map((card) => (
                  <div key={card.label} className="p-5 bg-card border border-border rounded-xl">
                    <div className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] mb-2">
                      {card.label}
                    </div>
                    <div className="text-[22px] font-bold text-foreground font-mono tabular-nums">
                      {card.value}
                    </div>
                    <div className="text-[10px] font-sans text-muted-foreground mt-1">
                      {card.sub}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Forecast Tab */}
        {tab === "forecast" && (
          <div className="space-y-4">
            {forecastLoading ? (
              <Loading />
            ) : !forecastData ? (
              <EmptyState icon={TrendingUp} text="No forecast yet — Allo puts a fresh one together each day. Check back soon." />
            ) : (
              <>
                <motion.div variants={itemVariants} className="grid grid-cols-3 gap-4">
                  {[
                    { label: "7-Day Forecast", value: forecastData.forecast7d, trend: forecastData.trend7d },
                    { label: "30-Day Forecast", value: forecastData.forecast30d, trend: forecastData.trend30d },
                    { label: "90-Day Forecast", value: forecastData.forecast90d, trend: forecastData.trend90d },
                  ].map((fc) => (
                    <div key={fc.label} className="p-5 bg-card border border-border rounded-xl">
                      <div className="text-[10px] font-sans text-muted-foreground uppercase font-bold tracking-[1px] mb-2">
                        {fc.label}
                      </div>
                      <div className="text-[24px] font-bold text-foreground font-mono tabular-nums">
                        ₹{(fc.value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                      {fc.trend != null && (
                        <div className={`text-[11px] font-mono mt-1 ${fc.trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {fc.trend >= 0 ? "+" : ""}{fc.trend}% vs prior period
                        </div>
                      )}
                    </div>
                  ))}
                </motion.div>

                {forecastData.generatedAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Last updated: {new Date(forecastData.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Mail; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-xl">
      <Icon className="w-8 h-8 text-muted-foreground/50 mb-3" />
      <p className="text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}
