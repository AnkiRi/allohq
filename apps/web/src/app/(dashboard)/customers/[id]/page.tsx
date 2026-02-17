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
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 font-mono">Customer not found</p>
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
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-mono hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK TO CUSTOMERS
        </Link>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-lg font-bold text-white font-mono">
            {(customer.firstName?.[0] ?? customer.email[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
              {customer.firstName} {customer.lastName}
            </h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-400 font-mono">
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
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono tracking-wide">
              RFM_ANALYSIS
            </h2>
          </div>
          {rfm ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1.5 bg-gray-900 text-white text-xs font-mono font-bold rounded">
                  {rfm.segment}
                </span>
                <span className="text-xs text-gray-400 font-mono">
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
                    <div className="text-xs text-gray-400 font-mono mb-2">{dim.label}</div>
                    <div className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-6 flex-1 rounded-sm ${
                            i < dim.score ? "bg-gray-900" : "bg-gray-100"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="text-right text-xs font-mono text-gray-500 mt-1">
                      {dim.score}/5
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <div className="text-xs text-gray-400 font-mono">ORDERS</div>
                  <div className="text-lg font-bold font-mono text-gray-900">{rfm.orderCount}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-mono">TOTAL SPENT</div>
                  <div className="text-lg font-bold font-mono text-gray-900">
                    ${rfm.totalSpent.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-mono">AVG ORDER</div>
                  <div className="text-lg font-bold font-mono text-gray-900">
                    ${rfm.avgOrderValue.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 font-mono">RFM not calculated yet</p>
          )}
        </div>

        {/* LTV Card */}
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-px h-6 bg-gray-900" />
            <h2 className="text-sm font-bold text-gray-900 font-mono tracking-wide">
              LIFETIME_VALUE
            </h2>
          </div>
          {ltv ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 font-mono mb-1">HISTORICAL LTV</div>
                  <div className="text-2xl font-bold font-mono text-gray-900">
                    ${ltv.historicalLtv.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-mono mb-1">PREDICTED LTV</div>
                  <div className="text-2xl font-bold font-mono text-gray-900">
                    ${ltv.predictedLtv.toFixed(0)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <div className="text-xs text-gray-400 font-mono">FREQUENCY</div>
                  <div className="text-sm font-bold font-mono text-gray-900">
                    {ltv.purchaseFrequency.toFixed(1)}/mo
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-mono">LIFESPAN</div>
                  <div className="text-sm font-bold font-mono text-gray-900">
                    {ltv.customerLifespan.toFixed(0)} mo
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 font-mono">CHURN RISK</div>
                  <div className="text-sm font-bold font-mono text-gray-900">
                    {(ltv.churnProbability * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              {/* Churn bar */}
              <div>
                <div className="text-xs text-gray-400 font-mono mb-2">CHURN PROBABILITY</div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-900 rounded-full"
                    style={{ width: `${ltv.churnProbability * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 font-mono">LTV not calculated yet</p>
          )}
        </div>
      </div>

      {/* Tags */}
      {customer.tags.length > 0 && (
        <div className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <Tag className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">TAGS</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 border border-gray-200 rounded-md text-xs font-mono text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <ShoppingBag className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">RECENT_ORDERS</h2>
        </div>
        {customer.orders.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-gray-400 font-mono">No orders yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Order</th>
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Status</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Total</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customer.orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-mono text-gray-900 font-bold">
                    #{order.orderNumber}
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-mono font-bold text-gray-900">
                    ${order.totalPrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right text-xs font-mono text-gray-400">
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
