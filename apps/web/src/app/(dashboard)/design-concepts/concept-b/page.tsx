"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  DollarSign,
  ShieldAlert,
  Zap,
  Mail,
  ChevronRight,
  Sparkles,
  Bell,
  Search,
  Command,
  CheckCircle,
  ArrowLeft,
  Target,
  Play,
  Pause,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Animated Counter
// ---------------------------------------------------------------------------

function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 1.2,
  className = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) =>
    prefix + v.toLocaleString("en-US", { maximumFractionDigits: 0 }) + suffix
  );
  const [display, setDisplay] = useState(prefix + "0" + suffix);

  useEffect(() => {
    const controls = animate(motionVal, value, { duration, ease: "easeOut" });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [value]);

  return <span className={className}>{display}</span>;
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function Sparkline({ data, color = "#7c3aed", width = 64, height = 22 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} className="inline-block ml-2">
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Glow Dot
// ---------------------------------------------------------------------------

function GlowDot({ color = "#7c3aed" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full opacity-40 animate-ping" style={{ background: color }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color, boxShadow: `0 0 8px ${color}60` }} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Concept B
// ---------------------------------------------------------------------------

export default function ConceptB() {
  const [revenueSaved, setRevenueSaved] = useState(12340);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setRevenueSaved((v) => v + Math.floor(Math.random() * 15) + 5), 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCommandOpen((v) => !v); }
      if (e.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } };

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", color: "#e8e8ef", fontFamily: "'Inter', sans-serif" }}>
      {/* Command Palette */}
      <AnimatePresence>
        {commandOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => setCommandOpen(false)} />
            <motion.div className="relative w-[560px] rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#14141f", boxShadow: "0 0 80px rgba(124,58,237,0.1), 0 25px 50px rgba(0,0,0,0.5)" }} initial={{ scale: 0.95, opacity: 0, y: -10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                <Search className="w-4 h-4 text-white/30" />
                <input autoFocus className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/30" placeholder="Search customers, actions, ask agent..." />
                <kbd className="text-[10px] font-mono text-white/20 bg-white/5 px-1.5 py-0.5 rounded border border-white/10">ESC</kbd>
              </div>
              <div className="p-2">
                <div className="text-[10px] font-mono text-white/20 uppercase tracking-wider px-3 py-2">Quick Actions</div>
                {[
                  { icon: Sparkles, label: "Ask the Agent", hint: "AI" },
                  { icon: Users, label: "Search Customers", hint: "@" },
                  { icon: Mail, label: "Create Campaign", hint: ">" },
                  { icon: Target, label: "Churn Risk Report", hint: "" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
                    <item.icon className="w-4 h-4 text-white/40" />
                    <span className="text-sm flex-1 text-white/80">{item.label}</span>
                    <span className="text-[11px] font-mono text-white/20">{item.hint}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <motion.div className="sticky top-0 z-40 border-b border-white/5" style={{ background: "rgba(10,10,15,0.85)", backdropFilter: "blur(20px) saturate(1.5)" }} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center gap-4 px-6 py-3">
          <a href="/design-concepts" className="text-xs font-mono text-white/30 hover:text-white/50 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Concepts
          </a>
          <div className="flex-1" />

          {/* Agent Status — Glowing */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20" style={{ background: "rgba(124,58,237,0.06)" }}>
            <GlowDot color="#7c3aed" />
            <span className="text-[11px] font-mono text-violet-300/70">Agent monitoring 2,340 customers</span>
            <span className="text-[10px] font-mono text-violet-300/30">3m ago</span>
          </div>

          {/* Revenue Counter — Glowing */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/20" style={{ background: "rgba(6,182,212,0.06)" }}>
            <DollarSign className="w-3.5 h-3.5 text-cyan-400" />
            <AnimatedCounter value={revenueSaved} prefix="$" className="text-[12px] font-mono font-bold text-cyan-300 tabular-nums" duration={0.8} />
            <span className="text-[10px] font-mono text-cyan-400/30">saved</span>
          </div>

          <button onClick={() => setCommandOpen(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/3 hover:bg-white/5 transition-colors border border-white/5">
            <Search className="w-3.5 h-3.5 text-white/30" />
            <span className="text-[11px] text-white/30">Search...</span>
            <kbd className="text-[10px] font-mono text-white/15 bg-white/5 px-1.5 py-0.5 rounded border border-white/5"><Command className="w-2.5 h-2.5 inline" />K</kbd>
          </button>

          <button className="relative p-2 rounded-lg hover:bg-white/3 transition-colors">
            <Bell className="w-4 h-4 text-white/40" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" style={{ boxShadow: "0 0 6px rgba(124,58,237,0.6)" }} />
          </button>
        </div>
      </motion.div>

      {/* Main */}
      <motion.div className="max-w-[1200px] mx-auto px-6 py-8" variants={stagger} initial="hidden" animate="visible">
        {/* Greeting */}
        <motion.div variants={fadeUp} className="mb-8">
          <h1 className="text-[28px] font-bold tracking-[-0.03em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Good morning, Ujjawal
          </h1>
          <p className="text-[14px] text-white/40 mt-1">
            Your agent handled <strong className="text-white/70">23 interactions</strong> overnight and saved <strong className="text-cyan-400">$890</strong> in potential churn.
          </p>
        </motion.div>

        {/* KPIs */}
        <motion.div variants={fadeUp} className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Revenue Saved", value: 12340, prefix: "$", change: "+18%", up: true, spark: [2,4,3,7,5,8,12,10,14,12,16], color: "#06b6d4", border: "border-cyan-500/10" },
            { label: "Retained", value: 234, change: "+12%", up: true, spark: [10,14,12,18,15,20,22,19,24,21,23], color: "#7c3aed", border: "border-violet-500/10" },
            { label: "Churn Alerts", value: 7, change: "-3", up: false, spark: [12,10,8,9,7,8,6,7,5,7,7], color: "#f59e0b", border: "border-amber-500/10" },
            { label: "Agent Actions", value: 156, change: "+34", up: true, spark: [5,8,12,10,15,14,18,20,16,19,22], color: "#10b981", border: "border-emerald-500/10" },
          ].map((kpi, i) => (
            <motion.div key={i} className={`rounded-2xl p-5 border ${kpi.border} transition-all duration-300 hover:-translate-y-0.5 cursor-default`} style={{ background: "rgba(255,255,255,0.02)" }} whileHover={{ boxShadow: `0 0 40px ${kpi.color}08` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-white/25" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{kpi.label}</span>
                <Sparkline data={kpi.spark} color={kpi.color} />
              </div>
              <div className="flex items-end gap-3">
                <AnimatedCounter value={kpi.value} prefix={kpi.prefix || ""} className="text-[28px] font-bold tracking-[-0.02em] tabular-nums" />
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full mb-1 ${kpi.up ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                  {kpi.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {kpi.change}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid grid-cols-5 gap-6">
          {/* Left (3 cols) */}
          <div className="col-span-3 space-y-6">
            {/* Priority Alert */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-amber-500/15 p-5 relative overflow-hidden" style={{ background: "rgba(245,158,11,0.03)" }}>
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" style={{ boxShadow: "0 0 12px rgba(245,158,11,0.3)" }} />
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-white/90">3 Champions showing churn signals</div>
                  <p className="text-[12px] text-white/40 mt-1 leading-relaxed">
                    Sarah K. ($2,400 LTV), Mike R. ($1,800 LTV), and Lisa M. ($3,200 LTV). Agent drafted personalized win-back offers.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button className="text-[11px] font-mono font-semibold px-3.5 py-1.5 rounded-lg text-white transition-colors" style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 20px rgba(124,58,237,0.2)" }}>
                      Preview & Approve
                    </button>
                    <button className="text-[11px] font-mono font-semibold px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 border border-white/5 text-white/60 transition-colors">Review Each</button>
                    <button className="text-[11px] font-mono text-white/25 px-3.5 py-1.5 rounded-lg hover:bg-white/3 transition-colors">Dismiss</button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Agent Activity */}
            <motion.div variants={fadeUp}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-white/25">Agent Activity</h2>
                <div className="flex items-center gap-1.5">
                  <GlowDot color="#10b981" />
                  <span className="text-[10px] font-mono text-emerald-400/50">Live</span>
                </div>
              </div>
              <div className="space-y-1">
                {[
                  { status: "completed", action: "Sent win-back to Sarah K.", ch: "whatsapp", time: "3m", detail: "20% off Merino Sweater" },
                  { status: "completed", action: "Created segment: Holiday Shoppers", ch: null, time: "12m", detail: "142 customers" },
                  { status: "running", action: "Analyzing campaign performance...", ch: "email", time: "now", detail: "Winter Sale · 2,340 sent" },
                  { status: "completed", action: "Resolved Alex T. conversation", ch: "sms", time: "28m", detail: "Tracking question · 1.2s avg" },
                  { status: "completed", action: "Generated re-engagement draft", ch: "email", time: "1h", detail: "89 hibernating customers" },
                ].map((item, i) => {
                  const chColor: Record<string, string> = { whatsapp: "text-green-400 bg-green-500/10", sms: "text-blue-400 bg-blue-500/10", email: "text-purple-400 bg-purple-500/10" };
                  return (
                    <motion.div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/2 transition-all cursor-pointer" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i + 0.5, duration: 0.4 }}>
                      {item.status === "completed" ? <CheckCircle className="w-4 h-4 text-emerald-500/60 mt-0.5 flex-shrink-0" /> : <div className="mt-1 flex-shrink-0"><GlowDot color="#f59e0b" /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-white/80">{item.action}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.ch && <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${chColor[item.ch] || ""}`}>{item.ch}</span>}
                          <span className="text-[11px] text-white/25">{item.detail}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-white/15">{item.time}</span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            {/* At-Risk Customers */}
            <motion.div variants={fadeUp}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-white/25">At-Risk Customers</h2>
                <button className="text-[11px] font-mono text-violet-400/60 hover:text-violet-400 transition-colors">View all 7</button>
              </div>
              <div className="space-y-2">
                {[
                  { name: "Sarah K.", risk: 94, ltv: "$2,400", days: "67d", from: "Champion", to: "At Risk" },
                  { name: "Mike R.", risk: 87, ltv: "$1,800", days: "52d", from: "Loyal", to: "At Risk" },
                  { name: "Lisa M.", risk: 82, ltv: "$3,200", days: "48d", from: "Champion", to: "At Risk" },
                ].map((c, i) => (
                  <motion.div key={i} className="group rounded-xl border border-white/5 p-4 hover:border-violet-500/15 transition-all duration-300 cursor-pointer hover:-translate-y-0.5" style={{ background: "rgba(255,255,255,0.015)" }} whileHover={{ boxShadow: "0 4px 30px rgba(124,58,237,0.05)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold font-mono" style={{ background: "rgba(245,158,11,0.08)", color: "#f59e0b" }}>
                        {c.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-white/90">{c.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-semibold">{c.risk}%</span>
                        </div>
                        <div className="text-[11px] text-white/25 mt-0.5">
                          LTV: {c.ltv} · {c.days} ago · <span className="text-emerald-400/60">{c.from}</span>{" → "}<span className="text-amber-400/60">{c.to}</span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-lg text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>Send Offer</button>
                        <button className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/8 text-white/50 transition-colors">View</button>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/10 group-hover:text-white/30 transition-colors" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right (2 cols) */}
          <div className="col-span-2 space-y-6">
            {/* Automations Running */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-white/5 overflow-hidden" style={{ background: "rgba(255,255,255,0.015)" }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                <Zap className="w-4 h-4 text-violet-400" />
                <span className="text-[11px] font-mono uppercase tracking-[0.1em] font-bold text-white/40">Active Automations</span>
              </div>
              {[
                { name: "Win-Back: At Risk", status: "running", sent: 47, opened: 12, color: "#f59e0b" },
                { name: "Welcome Series", status: "running", sent: 234, opened: 189, color: "#7c3aed" },
                { name: "Post-Purchase", status: "paused", sent: 0, opened: 0, color: "#64748b" },
                { name: "Abandoned Cart", status: "running", sent: 18, opened: 8, color: "#06b6d4" },
              ].map((auto, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/3 hover:bg-white/2 transition-colors cursor-pointer">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: auto.color, boxShadow: auto.status === "running" ? `0 0 6px ${auto.color}40` : "none" }} />
                  <span className="text-[12px] font-medium text-white/70 flex-1">{auto.name}</span>
                  {auto.status === "running" ? (
                    <span className="text-[10px] font-mono text-white/20">{auto.sent} sent · {auto.opened} opened</span>
                  ) : (
                    <span className="text-[10px] font-mono text-white/15">Paused</span>
                  )}
                  {auto.status === "running" ? <Pause className="w-3 h-3 text-white/15" /> : <Play className="w-3 h-3 text-white/15" />}
                </div>
              ))}
            </motion.div>

            {/* Segment Distribution */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-white/5 p-5" style={{ background: "rgba(255,255,255,0.015)" }}>
              <h3 className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-white/25 mb-4">Segments</h3>
              <div className="space-y-3">
                {[
                  { name: "Champions", count: 342, pct: 28, color: "#f59e0b", trend: "+12" },
                  { name: "Loyal", count: 456, pct: 37, color: "#7c3aed", trend: "+5" },
                  { name: "Promising", count: 198, pct: 16, color: "#06b6d4", trend: "+8" },
                  { name: "At Risk", count: 156, pct: 13, color: "#f59e0b", trend: "-3" },
                  { name: "Lost", count: 73, pct: 6, color: "#64748b", trend: "-4" },
                ].map((seg) => (
                  <div key={seg.name} className="cursor-pointer group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
                        <span className="text-[12px] font-medium text-white/60 group-hover:text-white/80 transition-colors">{seg.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-white/20 tabular-nums">{seg.count}</span>
                        <span className={`text-[10px] font-mono font-semibold ${seg.trend.startsWith("+") ? "text-emerald-400/60" : "text-amber-400/60"}`}>{seg.trend}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/3 overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{ background: seg.color, opacity: 0.5 }} initial={{ width: 0 }} animate={{ width: `${seg.pct}%` }} transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }} />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Empty State */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-dashed border-white/5 p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-violet-500/5 flex items-center justify-center mx-auto mb-3">
                <Mail className="w-5 h-5 text-violet-400/20" />
              </div>
              <p className="text-[13px] font-medium text-white/40">No campaigns running</p>
              <p className="text-[11px] text-white/20 mt-1 max-w-[200px] mx-auto">The agent can draft one from your segments.</p>
              <button className="mt-3 text-[11px] font-mono font-semibold px-4 py-1.5 rounded-lg text-white inline-flex items-center gap-1.5 transition-all" style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 20px rgba(124,58,237,0.15)" }}>
                <Sparkles className="w-3 h-3" /> Let Agent Draft One
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
