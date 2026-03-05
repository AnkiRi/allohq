"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Sparkles,
  Bell,
  Search,
  Command,
  CheckCircle,
  ArrowLeft,
  DollarSign,
  ShieldAlert,
  MessageSquare,
  ChevronRight,
  AlertTriangle,
  Activity,
  Pause,
  Play,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Concept E: Split Workspace — Dashboard left, Agent right, always visible
// Dark theme with violet/emerald accents
// ---------------------------------------------------------------------------

function GlowDot({ color = "#8b5cf6" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping" style={{ background: color }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color, boxShadow: `0 0 8px ${color}60` }} />
    </span>
  );
}

function Sparkline({ data, color = "#8b5cf6" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 56},${18 - ((v - min) / range) * 14}`).join(" ");
  return (
    <svg width={56} height={18} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

export default function ConceptE() {
  const [input, setInput] = useState("");
  const [agentTab, setAgentTab] = useState<"chat" | "tools" | "alerts">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } } };

  return (
    <div className="h-screen flex" style={{ background: "#0f0f14", color: "#e8e8ef", fontFamily: "'Inter', sans-serif" }}>
      {/* ── LEFT: Dashboard ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-5 h-12 border-b border-white/5 flex-shrink-0" style={{ background: "rgba(15,15,20,0.9)", backdropFilter: "blur(12px)" }}>
          <a href="/design-concepts" className="text-[11px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </a>
          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <GlowDot color="#10b981" />
            <span className="text-[10px] font-mono text-emerald-400/50">2,340 monitored</span>
          </div>
          <div className="w-px h-4 bg-white/5" />
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 text-emerald-400" />
            <span className="text-[12px] font-mono font-bold text-emerald-300 tabular-nums">$12,340</span>
            <span className="text-[9px] font-mono text-emerald-400/30">saved</span>
          </div>
          <div className="w-px h-4 bg-white/5" />
          <button className="flex items-center gap-1.5 text-white/30 hover:text-white/50 transition-colors">
            <Search className="w-3.5 h-3.5" />
            <kbd className="text-[9px] font-mono text-white/15 bg-white/5 px-1 py-0.5 rounded"><Command className="w-2.5 h-2.5 inline" />K</kbd>
          </button>
          <button className="relative"><Bell className="w-4 h-4 text-white/30" /><span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-violet-500" style={{ boxShadow: "0 0 6px rgba(139,92,246,0.5)" }} /></button>
        </div>

        {/* Dashboard content */}
        <div className="flex-1 overflow-y-auto p-5">
          <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
            {/* Greeting */}
            <motion.div variants={fadeUp}>
              <h1 className="text-[24px] font-bold tracking-[-0.03em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Good morning</h1>
              <p className="text-[13px] text-white/35 mt-1">23 interactions overnight · <span className="text-emerald-400/70">$890 saved</span></p>
            </motion.div>

            {/* KPIs */}
            <motion.div variants={fadeUp} className="grid grid-cols-4 gap-3">
              {[
                { label: "Revenue", val: "$12,340", ch: "+18%", up: true, spark: [2,4,3,7,5,8,12,10,14,12,16], color: "#10b981" },
                { label: "Retained", val: "234", ch: "+12%", up: true, spark: [10,14,12,18,15,20,22,19,24,21,23], color: "#8b5cf6" },
                { label: "Churn", val: "7", ch: "-3", up: false, spark: [12,10,8,9,7,8,6,7,5,7,7], color: "#f59e0b" },
                { label: "Actions", val: "156", ch: "+34", up: true, spark: [5,8,12,10,15,14,18,20,16,19,22], color: "#06b6d4" },
              ].map((k, i) => (
                <div key={i} className="rounded-xl p-4 border border-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-white/20">{k.label}</span>
                    <Sparkline data={k.spark} color={k.color} />
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-[24px] font-bold tracking-[-0.02em] tabular-nums leading-none">{k.val}</span>
                    <span className={`text-[10px] font-mono font-semibold mb-0.5 ${k.up ? "text-emerald-400/70" : "text-amber-400/70"}`}>
                      {k.up ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />} {k.ch}
                    </span>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Alert */}
            <motion.div variants={fadeUp} className="rounded-xl border border-amber-500/15 p-4 relative overflow-hidden" style={{ background: "rgba(245,158,11,0.03)" }}>
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" style={{ boxShadow: "0 0 10px rgba(245,158,11,0.2)" }} />
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-white/85">3 Champions at churn risk</div>
                  <p className="text-[12px] text-white/35 mt-1">Combined $7,400 LTV. Agent has drafted interventions.</p>
                </div>
                <button className="text-[11px] font-mono px-3 py-1 rounded-lg text-white" style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", boxShadow: "0 0 15px rgba(139,92,246,0.15)" }}>Approve</button>
              </div>
            </motion.div>

            {/* At-Risk table */}
            <motion.div variants={fadeUp}>
              <h2 className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold text-white/20 mb-3">At-Risk Customers</h2>
              <div className="space-y-1.5">
                {[
                  { name: "Sarah K.", risk: 94, ltv: "$2,400", days: "67d", seg: "Champion → At Risk" },
                  { name: "Mike R.", risk: 87, ltv: "$1,800", days: "52d", seg: "Loyal → At Risk" },
                  { name: "Lisa M.", risk: 82, ltv: "$3,200", days: "48d", seg: "Champion → At Risk" },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-white/3 hover:border-violet-500/15 transition-all cursor-pointer group" style={{ background: "rgba(255,255,255,0.01)" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold font-mono" style={{ background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>{c.name.split(" ").map(n=>n[0]).join("")}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-white/80">{c.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{c.risk}%</span>
                      </div>
                      <span className="text-[10px] text-white/20">LTV: {c.ltv} · {c.days} · {c.seg}</span>
                    </div>
                    <button className="text-[10px] font-mono px-2 py-1 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}>Send Offer</button>
                    <ChevronRight className="w-3.5 h-3.5 text-white/10 group-hover:text-white/25 transition-colors" />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Automations */}
            <motion.div variants={fadeUp}>
              <h2 className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold text-white/20 mb-3">Automations</h2>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "Win-Back", active: true, sent: 47, opened: 12, color: "#f59e0b" },
                  { name: "Welcome Series", active: true, sent: 234, opened: 189, color: "#8b5cf6" },
                  { name: "Abandoned Cart", active: true, sent: 18, opened: 8, color: "#06b6d4" },
                  { name: "Post-Purchase", active: false, sent: 0, opened: 0, color: "#64748b" },
                ].map((a, i) => (
                  <div key={i} className="rounded-xl border border-white/5 p-3 hover:border-white/8 transition-colors cursor-pointer" style={{ background: "rgba(255,255,255,0.015)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: a.color, boxShadow: a.active ? `0 0 6px ${a.color}40` : "none" }} />
                      <span className="text-[12px] font-medium text-white/60">{a.name}</span>
                      {a.active ? <Pause className="w-3 h-3 text-white/10 ml-auto" /> : <Play className="w-3 h-3 text-white/10 ml-auto" />}
                    </div>
                    <div className="text-[10px] font-mono text-white/20">{a.active ? `${a.sent} sent · ${a.opened} opened` : "Paused"}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ── RIGHT: Agent Panel (always visible) ── */}
      <div className="w-[380px] flex-shrink-0 flex flex-col" style={{ background: "rgba(15,15,22,1)" }}>
        {/* Panel header */}
        <div className="flex items-center gap-2 px-4 h-12 border-b border-white/5 flex-shrink-0">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-[12px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Allo Agent</span>
          <GlowDot color="#10b981" />
          <div className="flex-1" />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5">
          {[
            { id: "chat" as const, label: "Chat", icon: MessageSquare },
            { id: "tools" as const, label: "Tools", icon: Activity, badge: 3 },
            { id: "alerts" as const, label: "Alerts", icon: Bell, badge: 2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAgentTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${agentTab === tab.id ? "text-white border-b-2 border-violet-500" : "text-white/25 hover:text-white/40"}`}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
              {tab.badge && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {agentTab === "chat" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 p-4 space-y-4">
                {/* Agent messages */}
                <div className="space-y-3">
                  <div className="text-[13px] text-white/60 leading-relaxed">
                    Good morning. I handled 23 interactions overnight and saved $890 in potential churn.
                  </div>

                  <div className="text-[13px] text-white/60 leading-relaxed">
                    Priority: <strong className="text-white/80">3 Champions</strong> showing churn signals. I&apos;ve drafted personalized win-back offers.
                  </div>

                  <div className="flex gap-2">
                    <button className="text-[11px] font-mono px-3 py-1.5 rounded-lg text-white" style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}>Approve All</button>
                    <button className="text-[11px] font-mono px-3 py-1.5 rounded-lg bg-white/5 text-white/50 hover:bg-white/8 transition-colors">Review Each</button>
                  </div>

                  {/* User message */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-br-sm text-[13px] text-white" style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }}>
                      Send Sarah a 20% off win-back
                    </div>
                  </div>

                  {/* Tool execution */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-mono text-emerald-400">
                      <CheckCircle className="w-2.5 h-2.5" /> create discount
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-[9px] font-mono text-emerald-400">
                      <CheckCircle className="w-2.5 h-2.5" /> send whatsapp
                    </span>
                  </div>

                  <div className="text-[13px] text-white/60 leading-relaxed">
                    Done. Sent <strong className="text-white/80">WINBACK-SARAH-20</strong> (20% off, 7 days) via WhatsApp. She&apos;ll get a message referencing her last purchase.
                  </div>
                </div>
                <div ref={messagesEndRef} />
              </div>

              {/* Suggestions + input */}
              <div className="p-3 border-t border-white/5">
                <div className="flex gap-1.5 mb-2 overflow-x-auto">
                  {["Send to Mike too", "Create segment", "Revenue report"].map((s) => (
                    <button key={s} className="flex-shrink-0 text-[10px] font-mono px-2.5 py-1 rounded-full border border-white/5 hover:border-violet-500/20 hover:bg-violet-500/5 text-white/30 hover:text-white/50 transition-colors">{s}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything..." className="flex-1 text-[13px] px-3 py-2 rounded-lg border border-white/5 bg-white/3 text-white outline-none focus:border-violet-500/30 placeholder:text-white/20 transition-colors" />
                  <button className="p-2 rounded-lg text-white" style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)" }} ><Send className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          )}

          {agentTab === "tools" && (
            <div className="p-3 space-y-1.5">
              {[
                { tool: "create_discount_code", status: "completed", time: "3m", input: "WINBACK-SARAH-20, 20% off", output: "Created on Shopify" },
                { tool: "send_whatsapp", status: "completed", time: "3m", input: "Sarah K., win-back message", output: "Delivered" },
                { tool: "query_segments", status: "completed", time: "15m", input: "churn risk > 80%", output: "3 customers found" },
                { tool: "get_churn_risk", status: "completed", time: "15m", input: "store analysis", output: "7 at risk, 3 critical" },
                { tool: "analyze_campaign", status: "running", time: "now", input: "Winter Sale Recap", output: "..." },
              ].map((t, i) => (
                <div key={i} className="rounded-lg border border-white/5 p-2.5 hover:border-white/8 transition-colors cursor-pointer" style={{ background: "rgba(255,255,255,0.015)" }}>
                  <div className="flex items-center gap-2">
                    {t.status === "completed" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500/60" />
                    ) : (
                      <GlowDot color="#f59e0b" />
                    )}
                    <span className="text-[11px] font-mono font-medium text-white/60 flex-1">{t.tool.replace(/_/g, " ")}</span>
                    <span className="text-[9px] font-mono text-white/15">{t.time}</span>
                  </div>
                  <div className="pl-6 mt-1.5 space-y-0.5">
                    <div className="text-[10px] text-white/20"><span className="text-white/30">In:</span> {t.input}</div>
                    <div className="text-[10px] text-white/20"><span className="text-white/30">Out:</span> {t.output}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {agentTab === "alerts" && (
            <div className="p-3 space-y-2">
              {[
                { severity: "critical", summary: "3 Champions at churn risk", detail: "Sarah K., Mike R., Lisa M. — combined $7,400 LTV", time: "8m", ack: false },
                { severity: "warning", summary: "Revenue 23% below average", detail: "Daily revenue $1,200 vs 30-day avg $1,560", time: "2h", ack: false },
                { severity: "info", summary: "Welcome Series performing well", detail: "189/234 opened (80.7%), 45 clicked", time: "4h", ack: true },
              ].map((a, i) => (
                <div key={i} className={`rounded-lg border p-3 transition-all ${a.severity === "critical" ? "border-red-500/20 bg-red-500/3" : a.severity === "warning" ? "border-amber-500/20 bg-amber-500/3" : "border-blue-500/15 bg-blue-500/3"} ${a.ack ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${a.severity === "critical" ? "text-red-500" : a.severity === "warning" ? "text-amber-500" : "text-blue-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-white/80">{a.summary}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{a.detail}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] font-mono text-white/15">{a.time} ago</span>
                        {!a.ack && (
                          <>
                            <button className="text-[10px] font-mono text-violet-400 hover:text-violet-300 transition-colors">Investigate</button>
                            <button className="text-[10px] font-mono text-white/20 hover:text-white/40 transition-colors">Dismiss</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
