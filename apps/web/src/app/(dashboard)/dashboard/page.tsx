"use client";

import Link from "next/link";
import { ArrowUpRight, Users, Layers, Brain, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function DashboardPage() {
  const { data, isLoading } = trpc.health.check.useQuery();

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
              isLoading ? "bg-gray-300 animate-pulse" : data ? "bg-gray-900" : "bg-gray-300"
            }`}
          />
          <span className="text-xs font-mono text-gray-500">
            {isLoading ? "Checking API..." : data ? "API connected" : "API offline"}
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

      {/* Stats placeholder */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "TOTAL CUSTOMERS", value: "—" },
          { label: "ACTIVE CAMPAIGNS", value: "—" },
          { label: "REVENUE THIS MONTH", value: "—" },
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

      {/* Recent activity placeholder */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-px h-5 bg-gray-900" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">RECENT_ACTIVITY</h2>
        </div>
        <div className="p-10 text-center">
          <p className="text-sm text-gray-400 font-mono">No activity yet</p>
          <p className="text-xs text-gray-300 font-mono mt-1">
            Connect a store to get started
          </p>
        </div>
      </div>
    </div>
  );
}
