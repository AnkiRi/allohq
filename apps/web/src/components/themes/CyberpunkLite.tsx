"use client";

import { Terminal, Cpu, Zap, Shield } from "lucide-react";

export function CyberpunkLite() {
  return (
    <div className="min-h-screen bg-gray-950 p-8 overflow-hidden relative">
      {/* Subtle grid background - much softer than full cyberpunk */}
      <div className="fixed inset-0 opacity-[0.06]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(100,200,180,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(100,200,180,0.5) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Soft ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full opacity-[0.04] bg-teal-400 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full opacity-[0.03] bg-indigo-400 blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-6">
        {/* Header - clean, not overly neon */}
        <div className="relative border border-gray-800/80 rounded-2xl p-8 bg-gray-900/60 backdrop-blur-xl">
          <div className="flex items-center gap-4 mb-4">
            <Terminal className="w-8 h-8 text-teal-400/70" />
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
            </div>
          </div>
          <h1 className="text-4xl font-semibold mb-2 tracking-tight">
            <span className="text-teal-300/80">Cyber</span>
            <span className="text-indigo-300/80">punk</span>{" "}
            <span className="text-gray-400">Lite</span>
          </h1>
          <p className="text-gray-500 font-mono text-sm">
            {">"} Refined dark mode — same vibe, softer execution
          </p>
        </div>

        {/* Stats - muted neon, no aggressive glow */}
        <div className="grid grid-cols-4 gap-5">
          {[
            { icon: Zap, label: "POWER", value: "99.9%", color: "teal" },
            { icon: Shield, label: "SECURE", value: "100%", color: "emerald" },
            { icon: Cpu, label: "ACTIVE", value: "2.5K", color: "indigo" },
            { icon: Terminal, label: "ONLINE", value: "24/7", color: "violet" },
          ].map((stat, i) => {
            const colorMap: Record<string, { border: string; text: string; iconText: string; bg: string }> = {
              teal: { border: "border-teal-500/20", text: "text-teal-300/80", iconText: "text-teal-400/60", bg: "bg-teal-500/5" },
              emerald: { border: "border-emerald-500/20", text: "text-emerald-300/80", iconText: "text-emerald-400/60", bg: "bg-emerald-500/5" },
              indigo: { border: "border-indigo-500/20", text: "text-indigo-300/80", iconText: "text-indigo-400/60", bg: "bg-indigo-500/5" },
              violet: { border: "border-violet-500/20", text: "text-violet-300/80", iconText: "text-violet-400/60", bg: "bg-violet-500/5" },
            };
            const c = colorMap[stat.color] ?? colorMap.teal!;

            return (
              <div
                key={i}
                className={`border ${c!.border} ${c!.bg} backdrop-blur-sm rounded-xl p-6 hover:bg-gray-800/40 transition-all duration-300 group`}
              >
                <stat.icon className={`w-7 h-7 ${c!.iconText} mb-4 group-hover:opacity-100 transition-opacity`} />
                <div className={`text-2xl font-semibold ${c!.text} mb-1 font-mono`}>
                  {stat.value}
                </div>
                <div className="text-gray-600 text-xs font-mono uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Panels - clean borders, no heavy glow effects */}
        <div className="grid grid-cols-2 gap-6">
          <div className="border border-gray-800/80 bg-gray-900/40 backdrop-blur-xl rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-px h-6 bg-gradient-to-b from-transparent via-teal-500/40 to-transparent" />
              <h3 className="text-base font-medium text-teal-300/70 font-mono tracking-wide">SYSTEM_STATUS</h3>
            </div>
            <div className="space-y-5">
              {[
                { label: "CPU Usage", value: 45, color: "teal" },
                { label: "Memory", value: 67, color: "indigo" },
                { label: "Network", value: 89, color: "violet" },
              ].map((item, i) => {
                const barColors: Record<string, { bar: string; text: string }> = {
                  teal: { bar: "bg-teal-500/50", text: "text-teal-400/70" },
                  indigo: { bar: "bg-indigo-500/50", text: "text-indigo-400/70" },
                  violet: { bar: "bg-violet-500/50", text: "text-violet-400/70" },
                };
                const bc = barColors[item.color] ?? barColors.teal!;

                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-gray-500 font-mono">{item.label}</span>
                      <span className={`${bc!.text} font-mono`}>{item.value}%</span>
                    </div>
                    <div className="h-1 bg-gray-800/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${bc!.bar} rounded-full transition-all duration-700`}
                        style={{ width: `${item.value}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border border-gray-800/80 bg-gray-900/40 backdrop-blur-xl rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-px h-6 bg-gradient-to-b from-transparent via-indigo-500/40 to-transparent" />
              <h3 className="text-base font-medium text-indigo-300/70 font-mono tracking-wide">LIVE_FEED</h3>
            </div>
            <div className="space-y-3 font-mono text-sm">
              {[
                { time: "12:34:56", msg: "Campaign deployed", type: "success" },
                { time: "12:34:52", msg: "User authenticated", type: "info" },
                { time: "12:34:48", msg: "Workflow triggered", type: "warning" },
                { time: "12:34:44", msg: "Data synchronized", type: "success" },
              ].map((log, i) => (
                <div key={i} className="flex gap-3 items-start py-1 hover:bg-gray-800/20 px-2 -mx-2 rounded transition-colors">
                  <span className="text-gray-700">[{log.time}]</span>
                  <span
                    className={`${
                      log.type === "success"
                        ? "text-emerald-400/70"
                        : log.type === "warning"
                        ? "text-amber-400/70"
                        : "text-teal-400/70"
                    }`}
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Subtle scanline for texture */}
        <div className="fixed inset-0 pointer-events-none opacity-[0.015]" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
        }} />
      </div>
    </div>
  );
}
