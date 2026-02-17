"use client";

import { LayoutDashboard, Users, Mail, TrendingUp } from "lucide-react";

export function EnhancedGlassmorphic() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-3xl" />

          <div className="relative backdrop-blur-2xl bg-white/10 rounded-3xl p-8 border border-white/20 shadow-2xl">
            <h1 className="text-4xl font-bold text-white mb-2">
              Enhanced Glassmorphic Dark
            </h1>
            <p className="text-gray-300">
              Dramatic glass effects with dark theme and neon accents
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: "Revenue", value: "$124.5K", change: "+12.5%", icon: TrendingUp },
            { label: "Customers", value: "2,543", change: "+8.2%", icon: Users },
            { label: "Campaigns", value: "48", change: "+4", icon: Mail },
            { label: "Open Rate", value: "68.4%", change: "+2.1%", icon: LayoutDashboard },
          ].map((stat, i) => (
            <div
              key={i}
              className="relative group"
            >
              {/* Hover glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-blue-500/30 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative backdrop-blur-xl bg-white/10 rounded-2xl p-6 border border-white/20 hover:border-white/40 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-purple-400" />
                  <span className="text-green-400 text-sm font-semibold">{stat.change}</span>
                </div>
                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-gray-400 text-sm">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Content Cards */}
        <div className="grid grid-cols-2 gap-6">
          <div className="backdrop-blur-2xl bg-white/10 rounded-3xl p-8 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">Recent Campaigns</h3>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="backdrop-blur-sm bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">Welcome Series {i}</span>
                    <span className="text-purple-400 text-sm">Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="backdrop-blur-2xl bg-white/10 rounded-3xl p-8 border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4">Top Products</h3>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="backdrop-blur-sm bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">Product {i}</span>
                    <span className="text-green-400 text-sm">$1.2K</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
