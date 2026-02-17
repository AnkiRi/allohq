"use client";

import { ArrowUpRight, Circle, Sparkles, TrendingUp, Users, ShoppingBag } from "lucide-react";

export function MinimalElegant() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8 overflow-hidden relative">
      {/* Subtle animated background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.07]"
          style={{
            background: "radial-gradient(circle, #f97316, transparent 70%)",
            animation: "floatBlob 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-1/2 -left-48 w-[600px] h-[600px] rounded-full opacity-[0.05]"
          style={{
            background: "radial-gradient(circle, #8b5cf6, transparent 70%)",
            animation: "floatBlob 25s ease-in-out infinite reverse",
          }}
        />
        <div
          className="absolute -bottom-32 right-1/3 w-[400px] h-[400px] rounded-full opacity-[0.06]"
          style={{
            background: "radial-gradient(circle, #06b6d4, transparent 70%)",
            animation: "floatBlob 22s ease-in-out infinite 3s",
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-10">
        {/* Header with subtle entrance animation */}
        <div
          className="pb-8"
          style={{ animation: "fadeSlideUp 0.8s ease-out both" }}
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full bg-orange-400"
                style={{ animation: "pulse-soft 3s ease-in-out infinite" }}
              />
              <div
                className="w-1.5 h-1.5 rounded-full bg-violet-400"
                style={{ animation: "pulse-soft 3s ease-in-out infinite 1s" }}
              />
              <div
                className="w-1 h-1 rounded-full bg-cyan-400"
                style={{ animation: "pulse-soft 3s ease-in-out infinite 2s" }}
              />
            </div>
            <span className="text-xs text-gray-400 font-medium tracking-[0.2em] uppercase ml-2">
              Dashboard
            </span>
          </div>
          <h1 className="text-5xl font-light text-gray-800 mb-3 tracking-tight">
            Minimal <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-rose-400 to-violet-500">Elegant</span>
          </h1>
          <p className="text-gray-400 text-lg font-light max-w-xl">
            Clean design with a breath of color and subtle movement
          </p>
          {/* Animated underline */}
          <div className="mt-6 h-px w-full bg-gradient-to-r from-orange-200 via-violet-200 to-transparent" style={{ animation: "shimmer 3s ease-in-out infinite" }} />
        </div>

        {/* Stats with staggered float-in */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { icon: TrendingUp, label: "Total Revenue", value: "$124,532", change: "+12.5%", accent: "orange" },
            { icon: Users, label: "Active Users", value: "2,543", change: "+8.2%", accent: "violet" },
            { icon: Sparkles, label: "Conversion", value: "3.24%", change: "+0.4%", accent: "cyan" },
            { icon: ShoppingBag, label: "Avg. Order", value: "$89.50", change: "+5.1%", accent: "rose" },
          ].map((stat, i) => {
            const accentMap: Record<string, { bg: string; text: string; border: string; glow: string }> = {
              orange: { bg: "bg-orange-50", text: "text-orange-500", border: "border-orange-100", glow: "rgba(249,115,22,0.08)" },
              violet: { bg: "bg-violet-50", text: "text-violet-500", border: "border-violet-100", glow: "rgba(139,92,246,0.08)" },
              cyan: { bg: "bg-cyan-50", text: "text-cyan-500", border: "border-cyan-100", glow: "rgba(6,182,212,0.08)" },
              rose: { bg: "bg-rose-50", text: "text-rose-500", border: "border-rose-100", glow: "rgba(244,63,94,0.08)" },
            };
            const colors = accentMap[stat.accent] || accentMap.orange;

            return (
              <div
                key={i}
                className={`group relative bg-white rounded-2xl p-6 border border-gray-100 hover:border-gray-200 transition-all duration-500 hover:-translate-y-1 hover:shadow-lg cursor-pointer`}
                style={{
                  animation: `fadeSlideUp 0.6s ease-out ${i * 0.1}s both`,
                  boxShadow: `0 0 0 0 transparent`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 20px 60px -15px ${colors.glow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 0 0 transparent`;
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}>
                    <stat.icon className={`w-5 h-5 ${colors.text}`} />
                  </div>
                  <span className="text-xs text-emerald-500 font-medium flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {stat.change}
                    <ArrowUpRight className="w-3 h-3" />
                  </span>
                </div>
                <div className="text-sm text-gray-400 font-medium mb-1">{stat.label}</div>
                <div className="text-3xl font-light text-gray-800 tracking-tight">{stat.value}</div>
                {/* Bottom accent line */}
                <div className={`absolute bottom-0 left-6 right-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-current to-transparent ${colors.text} opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
              </div>
            );
          })}
        </div>

        {/* Content cards with hover reveal */}
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Campaigns", count: "48 active", description: "Running smoothly across all channels", gradient: "from-orange-400 to-rose-400" },
            { title: "Customers", count: "2,543", description: "Growing 8.2% month over month", gradient: "from-violet-400 to-indigo-400" },
            { title: "Revenue", count: "$124.5K", description: "Up 12.5% compared to last month", gradient: "from-cyan-400 to-teal-400" },
          ].map((item, i) => (
            <div
              key={i}
              className="group relative bg-white rounded-2xl p-7 border border-gray-100 hover:border-gray-200 transition-all duration-500 hover:-translate-y-0.5 cursor-pointer overflow-hidden"
              style={{ animation: `fadeSlideUp 0.6s ease-out ${0.4 + i * 0.1}s both` }}
            >
              {/* Hover gradient reveal */}
              <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-700`} />

              <div className="relative">
                <div className="flex items-start justify-between mb-5">
                  <h3 className="text-base font-medium text-gray-700">{item.title}</h3>
                  <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <div className="text-3xl font-light text-gray-800 mb-2">{item.count}</div>
                <p className="text-sm text-gray-400 font-light">{item.description}</p>

                {/* Animated progress bar on hover */}
                <div className="mt-5 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${item.gradient} rounded-full w-0 group-hover:w-2/3 transition-all duration-1000 ease-out`}
                    style={{ opacity: 0.6 }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Activity list with subtle animations */}
        <div
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          style={{ animation: "fadeSlideUp 0.6s ease-out 0.7s both" }}
        >
          <div className="px-7 py-5 border-b border-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-700">Recent Activity</h3>
              <span className="text-xs text-gray-400 font-medium tracking-wide">VIEW ALL</span>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { action: "Campaign sent", target: "Welcome Series", time: "2 min ago", dot: "bg-orange-400" },
              { action: "Customer added", target: "John Doe", time: "5 min ago", dot: "bg-violet-400" },
              { action: "Workflow triggered", target: "Abandoned Cart", time: "12 min ago", dot: "bg-cyan-400" },
              { action: "Order received", target: "$129.00", time: "18 min ago", dot: "bg-rose-400" },
              { action: "Email opened", target: "Summer Sale Blast", time: "24 min ago", dot: "bg-emerald-400" },
            ].map((activity, i) => (
              <div
                key={i}
                className="px-7 py-4 hover:bg-gray-50/50 transition-all duration-300 group cursor-pointer"
                style={{ animation: `fadeSlideUp 0.4s ease-out ${0.8 + i * 0.05}s both` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className={`w-2 h-2 rounded-full ${activity.dot} transition-transform duration-300 group-hover:scale-150`} />
                      <div className={`absolute inset-0 w-2 h-2 rounded-full ${activity.dot} opacity-0 group-hover:opacity-40 group-hover:scale-[3] transition-all duration-500`} />
                    </div>
                    <div>
                      <span className="text-gray-700 font-medium text-sm">{activity.action}</span>
                      <span className="text-gray-300 mx-2">·</span>
                      <span className="text-gray-500 text-sm">{activity.target}</span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 group-hover:text-gray-500 transition-colors">{activity.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style jsx>{`
        @keyframes floatBlob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -40px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(15px, 30px) scale(1.03); }
        }
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse-soft {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
