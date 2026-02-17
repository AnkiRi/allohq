"use client";

import { ArrowUpRight, Circle } from "lucide-react";

export function ModernMinimalist() {
  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Ultra clean header */}
        <div className="border-b border-gray-200 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <Circle className="w-2 h-2 fill-purple-600 text-purple-600" />
            <span className="text-sm text-gray-500 font-medium">DASHBOARD</span>
          </div>
          <h1 className="text-5xl font-light text-gray-900 mb-3">
            Modern Minimalist
          </h1>
          <p className="text-gray-600 text-lg font-light">
            Ultra-clean design inspired by Linear and Vercel
          </p>
        </div>

        {/* Minimal stats */}
        <div className="grid grid-cols-4 gap-8">
          {[
            { label: "Total Revenue", value: "$124,532", change: "+12.5%" },
            { label: "Active Users", value: "2,543", change: "+8.2%" },
            { label: "Conversion", value: "3.24%", change: "+0.4%" },
            { label: "Avg. Order", value: "$89.50", change: "+5.1%" },
          ].map((stat, i) => (
            <div key={i} className="group">
              <div className="text-sm text-gray-500 font-medium mb-2">{stat.label}</div>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-light text-gray-900">{stat.value}</span>
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                  {stat.change}
                  <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <div className="mt-3 h-px bg-gradient-to-r from-purple-600 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>

        {/* Clean content blocks */}
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Campaigns", count: "48 active", description: "Running smoothly" },
            { title: "Customers", count: "2,543", description: "Growing 8.2% MoM" },
            { title: "Revenue", count: "$124.5K", description: "Up 12.5% this month" },
          ].map((item, i) => (
            <div
              key={i}
              className="border border-gray-200 rounded-xl p-6 hover:border-gray-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">{item.title}</h3>
                <ArrowUpRight className="w-5 h-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
              </div>
              <div className="text-3xl font-light text-gray-900 mb-2">{item.count}</div>
              <p className="text-sm text-gray-500">{item.description}</p>
            </div>
          ))}
        </div>

        {/* Table-like list */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <h3 className="font-medium text-gray-900">Recent Activity</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {[
              { action: "Campaign sent", target: "Welcome Series", time: "2 min ago" },
              { action: "Customer added", target: "John Doe", time: "5 min ago" },
              { action: "Workflow triggered", target: "Abandoned Cart", time: "12 min ago" },
              { action: "Order received", target: "$129.00", time: "18 min ago" },
            ].map((activity, i) => (
              <div key={i} className="px-6 py-4 hover:bg-gray-50 transition-colors group cursor-pointer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-purple-600 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div>
                      <span className="text-gray-900 font-medium">{activity.action}</span>
                      <span className="text-gray-500 mx-2">·</span>
                      <span className="text-gray-600">{activity.target}</span>
                    </div>
                  </div>
                  <span className="text-sm text-gray-500">{activity.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
