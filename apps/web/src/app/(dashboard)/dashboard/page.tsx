"use client";

import Link from "next/link";
import { ArrowUpRight, Users, Layers, Brain, Zap, ShoppingBag } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function DashboardPage() {
  const { data: health, isLoading: healthLoading } = trpc.health.check.useQuery();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-gray-200 rounded-xl p-8 bg-white">
        <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight mb-1">
          DASHBOARD
        </h1>
        <p className="text-sm text-gray-400 font-mono">
          AlloHQ — Marketing automation for e-commerce
        </p>

        {/* API health */}
        <div className="mt-5 flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              healthLoading ? "bg-gray-300 animate-pulse" : health ? "bg-gray-900" : "bg-gray-300"
            }`}
          />
          <span className="text-xs font-mono text-gray-500">
            {healthLoading ? "Checking API..." : health ? "API connected" : "API offline"}
          </span>
        </div>
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            title: "CUSTOMERS",
            description: "View & manage customer profiles",
            icon: Users,
            href: "/customers",
          },
          {
            title: "SEGMENTS",
            description: "RFM-based segmentation",
            icon: Layers,
            href: "/segments",
          },
          {
            title: "INTELLIGENCE",
            description: "RFM analysis & LTV insights",
            icon: Brain,
            href: "/intelligence",
          },
          {
            title: "CAMPAIGNS",
            description: "Email, SMS, WhatsApp",
            icon: Zap,
            href: "/campaigns",
          },
        ].map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="border border-gray-200 rounded-xl p-6 bg-white hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all duration-200 group"
          >
            <div className="flex items-start justify-between mb-4">
              <item.icon className="w-6 h-6 text-gray-300 group-hover:text-gray-900 transition-colors duration-200" />
              <ArrowUpRight className="w-4 h-4 text-gray-200 group-hover:text-gray-900 transition-colors duration-200" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 font-mono mb-1">{item.title}</h3>
            <p className="text-xs text-gray-400 font-mono">{item.description}</p>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "TOTAL CUSTOMERS",
            value: statsLoading ? "—" : stats?.totalCustomers?.toLocaleString() ?? "0",
          },
          {
            label: "ACTIVE CAMPAIGNS",
            value: "—",
          },
          {
            label: "REVENUE THIS MONTH",
            value: statsLoading
              ? "—"
              : `$${(stats?.revenueThisMonth ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="border border-gray-200 rounded-xl p-6 bg-white"
          >
            <div className="text-xs text-gray-400 font-mono uppercase tracking-wider mb-2">
              {stat.label}
            </div>
            <div className="text-3xl font-bold text-gray-900 font-mono">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-px h-5 bg-gray-900" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">RECENT_ACTIVITY</h2>
        </div>
        {statsLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : stats?.recentOrders && stats.recentOrders.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Order</th>
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Customer</th>
                <th className="text-left px-6 py-3 text-xs font-mono text-gray-400 uppercase">Status</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Total</th>
                <th className="text-right px-6 py-3 text-xs font-mono text-gray-400 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-mono font-bold text-gray-900">
                    #{order.orderNumber}
                  </td>
                  <td className="px-6 py-3 text-sm font-mono text-gray-700">
                    {order.customerName}
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
        ) : (
          <div className="p-10 text-center">
            <ShoppingBag className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400 font-mono">No orders yet</p>
            <p className="text-xs text-gray-300 font-mono mt-1">
              Connect a store and sync data to see activity
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
