"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Tag, ShoppingBag, BarChart2, Sparkles, Send } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { ReasoningReveal, type ReasoningStory } from "@/components/console/ReasoningReveal";
import { formatINR } from "@/components/console";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// Segment → semantic V2 token class. Strong cohorts read in success; the ones
// joon watches read in urgent; everyone else stays neutral. No hardcoded paint.
function getSegmentBadgeColor(segment: string): string {
  const s = segment.toLowerCase();
  if (s.includes("champion"))
    return "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.25)]";
  if (s.includes("loyal") || s.includes("potential"))
    return "bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)] border-[color-mix(in_srgb,var(--color-warning)_25%,transparent)]";
  if (s.includes("hibernat") || s.includes("lost"))
    return "bg-muted text-muted-foreground border-border";
  if (s.includes("risk"))
    return "bg-[hsl(var(--destructive)/0.14)] text-destructive border-[hsl(var(--destructive)/0.25)]";
  if (s.includes("new") || s.includes("recent"))
    return "bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))] border-[hsl(var(--accent)/0.25)]";
  return "bg-secondary text-secondary-foreground border-border";
}

// RFM dimension bar — strong reads success, mid reads warning, weak reads urgent.
function getRfmBarColor(score: number): string {
  if (score >= 4) return "bg-[hsl(var(--success))]";
  if (score === 3) return "bg-[var(--color-warning)]";
  return "bg-destructive";
}

// (getAiInsight removed — the per-customer worldview now flows through the
// shared ReasoningReveal story below.)

// What joon noticed about THIS person — a single compact reasoning story for the
// shared ReasoningReveal. Always carries the worldview shape: what joon saw, the
// move (or the deliberate restraint), predicted upside + NAMED downside, and a
// confidence-tagged close. Estimates until control data backs them.
function getCustomerStory(args: {
  name: string;
  segment: string | undefined;
  daysSinceLastOrder: number | null;
  orderCount: number;
}): ReasoningStory {
  const { name, segment, daysSinceLastOrder, orderCount } = args;
  const who = name.trim() || "this customer";
  const s = (segment ?? "").toLowerCase();
  const seen =
    daysSinceLastOrder !== null
      ? `last order ${daysSinceLastOrder} days ago · ${orderCount} in all`
      : `${orderCount} orders, none recent`;

  if (s.includes("hibernat") || s.includes("lost")) {
    return {
      lead: `${who} has gone quiet`,
      lines: [
        { text: `joon noticed: ${seen}` },
        { text: "a warm, personal win-back fits people like them" },
        { text: "downside if mistimed: ~3% unsub · low" },
        { text: "estimate · expected recovery worth a nudge", arrow: true },
      ],
    };
  }
  if (s.includes("risk")) {
    return {
      lead: `${who} is starting to drift`,
      lines: [
        { text: `joon noticed: ${seen}` },
        { text: "a timely, light note now keeps them close" },
        { text: "downside: annoyance if over-messaged · ~4%" },
        { text: "estimate · medium confidence", arrow: true },
      ],
    };
  }
  if (s.includes("champion")) {
    return {
      lead: `${who} is one of your best`,
      lines: [
        { text: `joon noticed: ${seen}` },
        { text: "early access or a thank-you reads well here" },
        { text: "no discount: kept on the list · not messaged", beat: true },
        { text: "estimate · protecting the relationship", arrow: true },
      ],
    };
  }
  if (s.includes("loyal") || s.includes("potential")) {
    return {
      lead: `${who} keeps coming back`,
      lines: [
        { text: `joon noticed: ${seen}` },
        { text: "a small loyalty nudge can move them up a tier" },
        { text: "downside: discount-training if overused · low" },
        { text: "estimate · medium confidence", arrow: true },
      ],
    };
  }
  if (s.includes("new") || s.includes("recent")) {
    return {
      lead: `${who} just joined you`,
      lines: [
        { text: `joon noticed: ${seen}` },
        { text: "a warm welcome beats a hard sell this early" },
        { text: "downside: too soon to push · keep it light", beat: true },
        { text: "estimate · low confidence yet", arrow: true },
      ],
    };
  }
  return {
    lead: `${who}`,
    lines: [
      { text: `joon noticed: ${seen}` },
      { text: "a personal note is the gentlest nudge to their next order" },
      { text: "downside: minimal at this cadence" },
      { text: "estimate · confidence builds with their history", arrow: true },
    ],
  };
}

function getLtvEmptyStateCta(segment: string | undefined): { label: string; description: string } {
  if (!segment) return { label: "Send a Campaign", description: "We'll work out lifetime value once this customer places their first order." };
  const s = segment.toLowerCase();
  if (s.includes("hibernat") || s.includes("lost"))
    return { label: "Send a Win-Back Offer", description: "We'll work out lifetime value once this customer places their first order." };
  if (s.includes("new") || s.includes("recent"))
    return { label: "Send a Welcome Series", description: "We'll work out lifetime value once this customer places their first order." };
  if (s.includes("risk"))
    return { label: "Send a Re-Engagement Email", description: "We'll work out lifetime value once this customer places their first order." };
  if (s.includes("potential"))
    return { label: "Send a Loyalty Incentive", description: "We'll work out lifetime value once this customer places their first order." };
  return { label: "Send a Campaign", description: "We'll work out lifetime value once this customer places their first order." };
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
        <p className="text-muted-foreground">We couldn&apos;t find this customer.</p>
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

  // What joon noticed about THIS person — fed to the shared ReasoningReveal.
  const fullName = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim();
  const customerStory = getCustomerStory({
    name: customer.firstName?.trim() || fullName || customer.email,
    segment,
    daysSinceLastOrder,
    orderCount: rfm?.orderCount ?? customer.orders.length,
  });
  // Champions / new buyers are deliberately left alone — name that restraint.
  const s = (segment ?? "").toLowerCase();
  const leftAlone = s.includes("champion") || s.includes("new") || s.includes("recent");

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
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-sans hover:text-foreground transition-colors mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to customers
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-lg font-bold text-secondary-foreground font-sans">
              {(customer.firstName?.[0] ?? customer.email[0] ?? "?").toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
                  {customer.firstName} {customer.lastName}
                </h1>
                {segment && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold border ${getSegmentBadgeColor(segment)}`}>
                    {segment}
                  </span>
                )}
                {/* Restraint, named — when joon deliberately holds off messaging */}
                {leftAlone && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono lowercase text-muted-foreground border border-border">
                    kept on the list · not messaged
                  </span>
                )}
                {rfm && (
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="text-[10px] font-mono text-muted-foreground">{rfm.totalScore}/15</span>
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--accent))] transition-all"
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

          <Link href="/campaigns/new" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-border text-[12px] font-sans text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
            <Mail className="w-3.5 h-3.5" /> Draft email campaign
          </Link>
        </div>
      </motion.div>

      {/* ── What joon noticed about THIS person ── leads the page, right after
          who they are. The ONE shared reasoning-reveal: what joon saw, the move
          (or the deliberate restraint), predicted upside + named downside +
          confidence. Estimate until control data backs it. ── */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-[hsl(var(--accent))]" />
          <h2 className="section-header text-[13px]">What joon noticed</h2>
        </div>
        <ReasoningReveal stories={[customerStory]} />
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-lg bg-foreground text-background text-[12px] font-sans hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-3.5 h-3.5" /> Draft this for them
        </Link>
      </motion.div>

      {/* ── RFM + LTV ── */}
      <div className="grid grid-cols-2 gap-6">
        {/* RFM Card */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <h2 className="section-header accent-bar-left text-[13px] mb-6">RFM analysis</h2>
          {rfm ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded text-[11px] font-sans font-bold border ${getSegmentBadgeColor(rfm.segment)}`}>
                  {rfm.segment}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Score: {rfm.totalScore}/15
                </span>
              </div>

              {/* Progress bars */}
              <div className="space-y-4">
                {[
                  { label: "RECENCY", score: rfm.recency, context: daysSinceLastOrder !== null ? `Last seen ${daysSinceLastOrder} days ago` : "Hasn't ordered yet" },
                  { label: "FREQUENCY", score: rfm.frequency, context: `${rfm.orderCount} total orders` },
                  { label: "MONETARY", score: rfm.monetary, context: `${formatINR(rfm.totalSpent)} total spent` },
                ].map((dim) => (
                  <div key={dim.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-sans text-muted-foreground">
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
                  <div className="text-[11px] text-muted-foreground font-sans">ORDERS</div>
                  <div className="text-lg font-bold font-mono text-foreground">{rfm.orderCount}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-sans">TOTAL SPENT</div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {formatINR(rfm.totalSpent)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-sans">AVG ORDER</div>
                  <div className="text-lg font-bold font-mono text-foreground">
                    {formatINR(rfm.avgOrderValue)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground font-sans">No RFM score yet. joon will add one as orders come in.</p>
          )}
        </motion.div>

        {/* LTV Card */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <h2 className="section-header accent-bar-left text-[13px] mb-6">Lifetime value</h2>
          {ltv ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-muted-foreground font-sans mb-1">HISTORICAL LTV</div>
                  <div className="text-[28px] tabular-nums font-bold font-mono text-foreground">
                    {formatINR(ltv.historicalLtv)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-sans mb-1">PREDICTED LTV</div>
                  <div className="text-[28px] tabular-nums font-bold font-mono text-foreground">
                    {formatINR(ltv.predictedLtv)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <div className="text-[11px] text-muted-foreground font-sans">FREQUENCY</div>
                  <div className="text-[13px] font-bold font-mono text-foreground">
                    {ltv.purchaseFrequency.toFixed(1)}/mo
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-sans">LIFESPAN</div>
                  <div className="text-[13px] font-bold font-mono text-foreground">
                    {ltv.customerLifespan.toFixed(0)} mo
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground font-sans">CHURN RISK</div>
                  <div className="text-[13px] font-bold font-mono text-foreground">
                    {(ltv.churnProbability * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              {/* Churn bar */}
              <div>
                <div className="text-[11px] text-muted-foreground font-sans mb-2">CHURN RISK ESTIMATE · HEURISTIC</div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full"
                    style={{ width: `${ltv.churnProbability * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BarChart2 className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-[14px] font-bold font-serif text-foreground mb-1">Not enough to go on yet</h3>
              <p className="text-[12px] text-muted-foreground font-sans mb-4 max-w-[240px]">
                {ltvCta.description}
              </p>
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-[12px] font-sans text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
              >
                <Send className="w-3.5 h-3.5" /> {ltvCta.label}
              </Link>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Customer Timeline ── */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <h2 className="section-header accent-bar-left text-[13px] mb-6">Timeline</h2>
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />

          {/* Imported entry */}
          <div className="relative pb-5">
            <div className="absolute left-[-19px] top-1.5 w-2.5 h-2.5 rounded-full bg-muted-foreground/30 border-2 border-background" />
            <div className="text-[12px] font-sans text-foreground">Imported from Shopify</div>
            <div className="text-[11px] font-sans text-muted-foreground mt-0.5">
              {customer.createdAt
                ? new Date(customer.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "Recently"}
            </div>
          </div>

          {/* Segmented entry */}
          {rfm && (
            <div className="relative pb-5">
              <div className="absolute left-[-19px] top-1.5 w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))] border-2 border-background" />
              <div className="text-[12px] font-sans text-foreground">
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
              <div className="absolute left-[-19px] top-1.5 w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] border-2 border-background" />
              <div className="text-[12px] font-mono text-foreground">
                Order #{order.orderNumber} &middot; {formatINR(order.totalPrice)}
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
                Nothing since. A friendly campaign could be the nudge they need.
              </div>
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-sans text-[hsl(var(--accent))] hover:text-foreground transition-colors"
              >
                <Send className="w-3 h-3" /> Create a campaign
              </Link>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Tags ── */}
      {customer.tags.length > 0 && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <h2 className="section-header text-[13px]">Tags</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 border border-border rounded-md text-[11px] font-sans text-muted-foreground"
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
          <h2 className="section-header text-[13px]">Recent orders</h2>
        </div>
        {customer.orders.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] text-muted-foreground font-sans">No orders yet.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Order</th>
                <th className="text-left px-6 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Status</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Total</th>
                <th className="text-right px-6 py-3 text-[10px] tracking-[0.5px] font-sans text-muted-foreground uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customer.orders.map((order) => (
                <tr key={order.id} className="glass-row-hover transition-colors">
                  <td className="px-6 py-3 text-[13px] font-mono text-foreground font-bold">
                    #{order.orderNumber}
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-sans bg-muted text-foreground">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-[13px] font-mono font-bold text-foreground">
                    {formatINR(order.totalPrice)}
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
