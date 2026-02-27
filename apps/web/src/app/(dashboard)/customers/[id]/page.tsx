"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Tag, ShoppingBag, BarChart2, Sparkles, MessageSquare, Send } from "lucide-react";
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

function getSegmentBadgeColor(segment: string): string {
  const s = segment.toLowerCase();
  if (s.includes("champion")) return "bg-olive/15 text-olive border-olive/20";
  if (s.includes("loyal")) return "bg-warm-gold/15 text-warm-gold border-warm-gold/20";
  if (s.includes("hibernat") || s.includes("lost")) return "bg-gray-400/15 text-gray-500 border-gray-400/20";
  if (s.includes("risk")) return "bg-terracotta/15 text-terracotta border-terracotta/20";
  if (s.includes("new") || s.includes("recent")) return "bg-sky-400/15 text-sky-600 border-sky-400/20";
  if (s.includes("potential")) return "bg-warm-gold/15 text-warm-gold border-warm-gold/20";
  return "bg-secondary text-secondary-foreground border-border";
}

function getRfmBarColor(score: number): string {
  if (score >= 4) return "bg-olive";
  if (score === 3) return "bg-warm-gold";
  return "bg-terracotta";
}

function getAiInsight(segment: string): string {
  const s = segment.toLowerCase();
  if (s.includes("hibernat") || s.includes("lost"))
    return "This customer hasn't purchased recently. Based on similar profiles, a personalized win-back offer with 15% off has a 23% conversion rate.";
  if (s.includes("champion"))
    return "This is one of your top customers! Consider a loyalty reward or early access to new products.";
  if (s.includes("risk"))
    return "This customer's purchase frequency is declining. A timely re-engagement email could prevent churn.";
  return "Send a personalized campaign to drive this customer's next purchase.";
}

function getLtvEmptyStateCta(segment: string | undefined): { label: string; description: string } {
  if (!segment) return { label: "Send a Campaign", description: "This customer needs at least 1 order for LTV calculation." };
  const s = segment.toLowerCase();
  if (s.includes("hibernat") || s.includes("lost"))
    return { label: "Send a Win-Back Offer", description: "This customer needs at least 1 order for LTV calculation." };
  if (s.includes("new") || s.includes("recent"))
    return { label: "Send a Welcome Series", description: "This customer needs at least 1 order for LTV calculation." };
  if (s.includes("risk"))
    return { label: "Send a Re-Engagement Email", description: "This customer needs at least 1 order for LTV calculation." };
  if (s.includes("potential"))
    return { label: "Send a Loyalty Incentive", description: "This customer needs at least 1 order for LTV calculation." };
  return { label: "Send a Campaign", description: "This customer needs at least 1 order for LTV calculation." };
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: customer, isLoading } = trpc.customers.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="glass-skeleton h-8 w-48 rounded" />
        <div className="glass-skeleton h-64 rounded-xl" />
        <div className="grid grid-cols-2 gap-6">
          <div className="glass-skeleton h-72 rounded-xl" />
          <div className="glass-skeleton h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground font-mono">Customer not found</p>
      </div>
    );
  }

  const rfm = customer.rfmScore;
  const ltv = customer.lifetimeValue;
  const segment = rfm?.segment;
  const ltvCta = getLtvEmptyStateCta(segment);

  const daysSinceLastOrder = rfm?.lastOrderAt
    ? Math.floor((Date.now() - new Date(rfm.lastOrderAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Profile Card ── */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO CUSTOMERS
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-lg font-bold text-secondary-foreground font-mono">
              {(customer.firstName?.[0] ?? customer.email[0] ?? "?").toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
                  {customer.firstName} {customer.lastName}
                </h1>
                {segment && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${getSegmentBadgeColor(segment)}`}>
                    {segment}
                  </span>
                )}
                {rfm && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="text-[10px] font-mono text-muted-foreground">{rfm.totalScore}/15</span>
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-olive transition-all"
                        style={{ width: `${(rfm.totalScore / 15) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-[13px] text-muted-foreground font-sans">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> {customer.email}
                </span>
                {customer.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" /> {customer.phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
              <Mail className="w-3.5 h-3.5" /> Send Email
            </button>
            <button className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
              <MessageSquare className="w-3.5 h-3.5" /> Send SMS
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── RFM + LTV ── */}
      <div className="grid grid-cols-2 gap-6">
        {/* RFM Card */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <h2 className="section-header accent-bar-left text-[13px] mb-6">RFM_ANALYSIS</h2>
          {rfm ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded text-[11px] font-mono font-bold border ${getSegmentBadgeColor(rfm.segment)}`}>
                  {rfm.segment}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Score: {rfm.totalScore}/15
                </span>
              </div>

              {/* Progress bars */}
              <div className="space-y-4">
                {[
                  { label: "RECENCY", score: rfm.recency, context: daysSinceLastOrder !== null ? `Last seen ${daysSinceLastOrder} days ago` : "No orders yet" },
                  { label: "FREQUENCY", score: rfm.frequency, context: `${rfm.orderCount} total orders` },
                  { label: "MONETARY", score: rfm.monetary, context: `$${rfm.totalSpent.toFixed(0)} total spent` },
                ].map((dim) => (
                  <div key={dim.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {dim.label} {dim.score}/5
                      </span>
                      <span className="text-[10px] font-sans text-muted-foreground">
                        {dim.context}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getRfmBarColor(dim.score)}`}
                        style={{ width: `${(dim.score / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono">ORDERS</div>
                  <div className="text-lg font-bold font-mono text-foreground">{rfm.orderCount}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono">TOTAL SPENT</div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    ${rfm.totalSpent.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono">AVG ORDER</div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    ${rfm.avgOrderValue.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground font-sans">RFM not calculated yet</p>
          )}
        </motion.div>

        {/* LTV Card */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <h2 className="section-header accent-bar-left text-[13px] mb-6">LIFETIME_VALUE</h2>
          {ltv ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono mb-1">HISTORICAL LTV</div>
                  <div className="text-[28px] tabular-nums font-bold font-mono text-foreground">
                    ${ltv.historicalLtv.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono mb-1">PREDICTED LTV</div>
                  <div className="text-[28px] tabular-nums font-bold font-mono text-foreground">
                    ${ltv.predictedLtv.toFixed(0)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono">FREQUENCY</div>
                  <div className="text-[13px] font-bold font-mono text-foreground">
                    {ltv.purchaseFrequency.toFixed(1)}/mo
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono">LIFESPAN</div>
                  <div className="text-[13px] font-bold font-mono text-foreground">
                    {ltv.customerLifespan.toFixed(0)} mo
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-mono">CHURN RISK</div>
                  <div className="text-[13px] font-bold font-mono text-foreground">
                    {(ltv.churnProbability * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              {/* Churn bar */}
              <div>
                <div className="text-[11px] text-muted-foreground font-mono mb-2">CHURN PROBABILITY</div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-terracotta rounded-full"
                    style={{ width: `${ltv.churnProbability * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BarChart2 className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-[14px] font-bold font-mono text-foreground mb-1">Not enough data yet</h3>
              <p className="text-[12px] text-muted-foreground font-sans mb-4 max-w-[240px]">
                {ltvCta.description}
              </p>
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-[12px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                <Send className="w-3.5 h-3.5" /> {ltvCta.label}
              </Link>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Customer Timeline ── */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <h2 className="section-header accent-bar-left text-[13px] mb-6">TIMELINE</h2>
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />

          {/* Imported entry */}
          <div className="relative pb-5">
            <div className="absolute left-[-19px] top-1.5 w-2.5 h-2.5 rounded-full bg-muted-foreground/30 border-2 border-background" />
            <div className="text-[12px] font-mono text-foreground">Imported from Shopify</div>
            <div className="text-[11px] font-sans text-muted-foreground mt-0.5">
              {customer.createdAt
                ? new Date(customer.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "Recently"}
            </div>
          </div>

          {/* Segmented entry */}
          {rfm && (
            <div className="relative pb-5">
              <div className="absolute left-[-19px] top-1.5 w-2.5 h-2.5 rounded-full bg-olive border-2 border-background" />
              <div className="text-[12px] font-mono text-foreground">
                Segmented as <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getSegmentBadgeColor(rfm.segment)}`}>{rfm.segment}</span>
              </div>
              <div className="text-[11px] font-sans text-muted-foreground mt-0.5">
                RFM Score: {rfm.totalScore}/15
              </div>
            </div>
          )}

          {/* Order entries */}
          {customer.orders.map((order) => (
            <div key={order.id} className="relative pb-5">
              <div className="absolute left-[-19px] top-1.5 w-2.5 h-2.5 rounded-full bg-warm-gold border-2 border-background" />
              <div className="text-[12px] font-mono text-foreground">
                Order #{order.orderNumber} &mdash; ${order.totalPrice.toFixed(2)}
              </div>
              <div className="text-[11px] font-sans text-muted-foreground mt-0.5">
                {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {" "}&middot;{" "}{order.status}
              </div>
            </div>
          ))}

          {/* End cap */}
          {customer.orders.length === 0 && (
            <div className="relative pb-1">
              <div className="absolute left-[-19px] top-1.5 w-2.5 h-2.5 rounded-full bg-muted border-2 border-background" />
              <div className="text-[12px] font-sans text-muted-foreground">
                No further activity. Consider sending a campaign.
              </div>
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-mono text-olive hover:text-foreground transition-colors"
              >
                <Send className="w-3 h-3" /> Create Campaign
              </Link>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── AI Insight Card ── */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-warm-gold" />
          <h2 className="section-header text-[13px]">AI INSIGHT</h2>
        </div>
        <p className="text-[13px] font-sans text-muted-foreground leading-relaxed mb-4">
          {getAiInsight(segment ?? "")}
        </p>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-[12px] font-mono hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-3.5 h-3.5" /> Generate Campaign
        </Link>
      </motion.div>

      {/* ── Tags ── */}
      {customer.tags.length > 0 && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <h2 className="section-header text-[13px]">TAGS</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 border border-border rounded-md text-[11px] font-mono text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Recent Orders ── */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header text-[13px]">RECENT_ORDERS</h2>
        </div>
        {customer.orders.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] text-muted-foreground font-sans">No orders yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Order</th>
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Status</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Total</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-mono text-muted-foreground uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customer.orders.map((order) => (
                <tr key={order.id} className="glass-row-hover transition-colors">
                  <td className="px-6 py-3 text-[13px] font-mono text-foreground font-bold">
                    #{order.orderNumber}
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-muted text-foreground">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-[13px] font-mono font-bold text-foreground">
                    ${order.totalPrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right text-[11px] font-mono text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>
    </motion.div>
  );
}
