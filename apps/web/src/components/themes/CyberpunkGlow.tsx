"use client";

import { Terminal, Cpu, Zap, Shield } from "lucide-react";

export function CyberpunkGlow() {
  return (
    <div className="min-h-screen bg-white p-8 overflow-hidden">
      {/* Subtle grid background - monochrome */}
      <div className="fixed inset-0 opacity-[0.04]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(#000 1px, transparent 1px),
              linear-gradient(90deg, #000 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="relative border border-gray-200 rounded-2xl p-8 bg-white">
          <div className="flex items-center gap-4 mb-4">
            <Terminal className="w-10 h-10 text-gray-900" />
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-900 animate-pulse" />
              <div
                className="w-3 h-3 rounded-full bg-gray-400 animate-pulse"
                style={{ animationDelay: "0.2s" }}
              />
              <div
                className="w-3 h-3 rounded-full bg-gray-200 animate-pulse"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
          </div>
          <h1 className="text-5xl font-bold mb-2 text-gray-900 tracking-tight">
            ALLOHQ
          </h1>
          <p className="text-gray-400 font-mono text-sm">
            {">"} Marketing automation, built for e-commerce
          </p>
        </div>

        {/* Stats - monochrome with structure */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { icon: Zap, label: "REVENUE", value: "$124K" },
            { icon: Shield, label: "CUSTOMERS", value: "2,543" },
            { icon: Cpu, label: "CONVERSION", value: "3.24%" },
            { icon: Terminal, label: "CAMPAIGNS", value: "48" },
          ].map((stat, i) => (
            <div key={i} className="relative group">
              <div className="border border-gray-200 bg-white rounded-xl p-6 hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all duration-200">
                <stat.icon className="w-7 h-7 text-gray-300 mb-4 group-hover:text-gray-900 transition-colors duration-200" />
                <div className="text-3xl font-bold text-gray-900 mb-1 font-mono">
                  {stat.value}
                </div>
                <div className="text-gray-400 text-xs font-mono uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Panels */}
        <div className="grid grid-cols-2 gap-6">
          <div className="border border-gray-200 bg-white rounded-2xl p-6 hover:border-gray-300 transition-colors">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-px h-8 bg-gray-900" />
              <h3 className="text-base font-bold text-gray-900 font-mono tracking-wide">
                SYSTEM_STATUS
              </h3>
            </div>
            <div className="space-y-4">
              {[
                { label: "Email Delivery", value: 98 },
                { label: "API Uptime", value: 100 },
                { label: "Sync Health", value: 89 },
              ].map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-2">
                    <span className="text-gray-500 font-mono">{item.label}</span>
                    <span className="text-gray-900 font-mono font-bold">
                      {item.value}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 rounded-full"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-gray-200 bg-white rounded-2xl p-6 hover:border-gray-300 transition-colors">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-px h-8 bg-gray-900" />
              <h3 className="text-base font-bold text-gray-900 font-mono tracking-wide">
                LIVE_FEED
              </h3>
            </div>
            <div className="space-y-3 font-mono text-sm">
              {[
                { time: "12:34:56", msg: "Campaign deployed", type: "success" },
                { time: "12:34:52", msg: "User authenticated", type: "info" },
                { time: "12:34:48", msg: "Workflow triggered", type: "warning" },
                { time: "12:34:44", msg: "Data synchronized", type: "success" },
              ].map((log, i) => (
                <div
                  key={i}
                  className="flex gap-3 items-start hover:bg-gray-50 px-2 -mx-2 py-1 rounded transition-colors"
                >
                  <span className="text-gray-300">[{log.time}]</span>
                  <span className="text-gray-700">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
