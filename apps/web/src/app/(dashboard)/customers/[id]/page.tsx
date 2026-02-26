"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, Tag, ShoppingBag } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function CustomerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: customer, isLoading } = trpc.customers.getById.useQuery({ id });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
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

  return (
    <div className="space-y-6">
      {/* Back link + header */}
      <div>
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO CUSTOMERS
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-lg font-bold text-secondary-foreground font-mono">
            {(customer.firstName?.[0] ?? customer.email[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
              {customer.firstName} {customer.lastName}
            </h1>
            <div className="flex items-center gap-4 mt-1 text-[13px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> {customer.email}
              </span>
              {customer.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> {customer.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RFM + LTV cards */}
      <div className="grid grid-cols-2 gap-6">
        {/* RFM Card */}
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-mono tracking-wide">
              RFM_ANALYSIS
            </h2>
          </div>
          {rfm ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1.5 bg-secondary text-secondary-foreground text-[11px] font-mono font-bold rounded">
                  {rfm.segment}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Score: {rfm.totalScore}/15
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "RECENCY", score: rfm.recency },
                  { label: "FREQUENCY", score: rfm.frequency },
                  { label: "MONETARY", score: rfm.monetary },
                ].map((dim) => (
                  <div key={dim.label}>
                    <div className="text-[11px] text-muted-foreground font-mono mb-2">{dim.label}</div>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-6 flex-1 rounded-sm ${
                            i < dim.score ? "bg-secondary" : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="text-right text-[11px] font-mono text-muted-foreground mt-1">
                      {dim.score}/5
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
            <p className="text-[13px] text-muted-foreground font-mono">RFM not calculated yet</p>
          )}
        </div>

        {/* LTV Card */}
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-secondary" />
            <h2 className="text-[13px] font-bold text-foreground font-mono tracking-wide">
              LIFETIME_VALUE
            </h2>
          </div>
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
                    className="h-full bg-secondary rounded-full"
                    style={{ width: `${ltv.churnProbability * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground font-mono">LTV not calculated yet</p>
          )}
        </div>
      </div>

      {/* Tags */}
      {customer.tags.length > 0 && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-4">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">TAGS</h2>
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
        </div>
      )}

      {/* Recent orders */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <ShoppingBag className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">RECENT_ORDERS</h2>
        </div>
        {customer.orders.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px] text-muted-foreground font-mono">No orders yet</p>
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
                <tr key={order.id} className="hover:bg-muted transition-colors">
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
      </div>
    </div>
  );
}
