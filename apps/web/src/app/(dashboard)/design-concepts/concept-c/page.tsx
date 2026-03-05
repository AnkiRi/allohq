"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Mail,
  Sparkles,
  Bell,
  Search,
  Command,
  ArrowLeft,
  Target,
  Layers,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Animated Counter
// ---------------------------------------------------------------------------

function AnimatedCounter({ value, prefix = "", className = "" }: { value: number; prefix?: string; className?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => prefix + v.toLocaleString("en-US", { maximumFractionDigits: 0 }));
  const [display, setDisplay] = useState(prefix + "0");
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.2, ease: "easeOut" });
    const u = rounded.on("change", (v) => setDisplay(v));
    return () => { c.stop(); u(); };
  }, [value]);
  return <span className={className}>{display}</span>;
}

// ---------------------------------------------------------------------------
// Minimal Sparkline (just dots)
// ---------------------------------------------------------------------------

function DotSparkline({ data, color = "#2563eb" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return (
    <svg width={48} height={16} className="inline-block ml-2">
      {data.slice(-7).map((v, i) => {
        const x = (i / 6) * 42 + 3;
        const y = 13 - ((v - min) / range) * 10;
        return <circle key={i} cx={x} cy={y} r={i === 6 ? 2 : 1.2} fill={color} opacity={i === 6 ? 1 : 0.25} />;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Concept C — Nordic Minimal
// ---------------------------------------------------------------------------

export default function ConceptC() {
  const [revenueSaved, setRevenueSaved] = useState(12340);
  const [commandOpen, setCommandOpen] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState<number | null>(null);

  useEffect(() => {
    const i = setInterval(() => setRevenueSaved((v) => v + Math.floor(Math.random() * 15) + 5), 4000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCommandOpen((v) => !v); }
      if (e.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } };
  const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } } };

  return (
    <div className="min-h-screen" style={{ background: "#fafafa", color: "#171717", fontFamily: "'Inter', sans-serif" }}>
      {/* Command Palette */}
      <AnimatePresence>
        {commandOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <div className="fixed inset-0 bg-black/10 backdrop-blur-[2px]" onClick={() => setCommandOpen(false)} />
            <motion.div className="relative w-[520px] bg-white rounded-xl shadow-[0_16px_70px_rgba(0,0,0,0.12)] border border-neutral-200 overflow-hidden" initial={{ scale: 0.97, opacity: 0, y: -8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
                <Search className="w-4 h-4 text-neutral-300" />
                <input autoFocus className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-neutral-300" placeholder="Type a command or search..." />
                <kbd className="text-[10px] font-mono text-neutral-300 bg-neutral-50 px-1.5 py-0.5 rounded border border-neutral-100">esc</kbd>
              </div>
              <div className="p-1.5">
                {[
                  { icon: Sparkles, label: "Ask the Agent" },
                  { icon: Users, label: "Search Customers" },
                  { icon: Layers, label: "Jump to Segment" },
                  { icon: Mail, label: "Create Campaign" },
                  { icon: Target, label: "View Churn Report" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-neutral-50 cursor-pointer transition-colors">
                    <item.icon className="w-4 h-4 text-neutral-400" />
                    <span className="text-[13px]">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar — razor thin */}
      <motion.div className="sticky top-0 z-40 border-b border-neutral-100" style={{ background: "rgba(250,250,250,0.9)", backdropFilter: "blur(12px)" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <div className="flex items-center gap-6 px-8 h-12">
          <a href="/design-concepts" className="text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </a>

          <div className="flex-1" />

          {/* Agent Status — minimal */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-40 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
            </span>
            <span className="text-[11px] text-neutral-400">2,340 monitored</span>
          </div>

          <div className="w-px h-4 bg-neutral-200" />

          {/* Revenue — prominent but clean */}
          <div className="flex items-center gap-1.5">
            <AnimatedCounter value={revenueSaved} prefix="$" className="text-[13px] font-semibold tabular-nums tracking-[-0.02em]" />
            <span className="text-[11px] text-neutral-400">saved</span>
          </div>

          <div className="w-px h-4 bg-neutral-200" />

          <button onClick={() => setCommandOpen(true)} className="flex items-center gap-2 text-neutral-400 hover:text-neutral-600 transition-colors">
            <Search className="w-3.5 h-3.5" />
            <kbd className="text-[10px] font-mono text-neutral-300 bg-neutral-100 px-1.5 py-0.5 rounded"><Command className="w-2.5 h-2.5 inline" />K</kbd>
          </button>

          <button className="relative">
            <Bell className="w-4 h-4 text-neutral-400" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
          </button>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div className="max-w-[1100px] mx-auto px-8 py-12" variants={stagger} initial="hidden" animate="visible">
        {/* Greeting — lots of whitespace */}
        <motion.div variants={fadeUp} className="mb-12">
          <h1 className="text-[32px] font-semibold tracking-[-0.04em] text-neutral-900">
            Good morning
          </h1>
          <p className="text-[15px] text-neutral-400 mt-2 leading-relaxed">
            23 interactions handled overnight. <span className="text-neutral-900 font-medium">$890 saved</span> from potential churn.
          </p>
        </motion.div>

        {/* KPIs — ultra minimal cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-4 gap-px mb-12 bg-neutral-200 rounded-xl overflow-hidden">
          {[
            { label: "Revenue Saved", value: 12340, prefix: "$", change: "+18%", up: true, data: [2,4,3,7,5,8,12,10,14,12,16] },
            { label: "Customers Retained", value: 234, change: "+12%", up: true, data: [10,14,12,18,15,20,22,19,24,21,23] },
            { label: "Churn Alerts", value: 7, change: "-3", up: false, data: [12,10,8,9,7,8,6,7,5,7,7] },
            { label: "Agent Actions", value: 156, change: "+34", up: true, data: [5,8,12,10,15,14,18,20,16,19,22] },
          ].map((kpi, i) => (
            <div key={i} className="bg-white p-6 cursor-default">
              <div className="text-[11px] text-neutral-400 uppercase tracking-[0.08em] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {kpi.label}
              </div>
              <div className="flex items-end gap-2">
                <AnimatedCounter value={kpi.value} prefix={kpi.prefix || ""} className="text-[30px] font-semibold tracking-[-0.03em] tabular-nums leading-none" />
                <DotSparkline data={kpi.data} color={kpi.up ? "#171717" : "#2563eb"} />
              </div>
              <div className="mt-3">
                <span className={`text-[11px] font-mono ${kpi.up ? "text-neutral-600" : "text-blue-600"}`}>
                  {kpi.up ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />}
                  {" "}{kpi.change} from last week
                </span>
              </div>
            </div>
          ))}
        </motion.div>

        <div className="grid grid-cols-3 gap-8">
          {/* Left (2 cols) */}
          <div className="col-span-2 space-y-8">
            {/* Priority Alert — minimal */}
            <motion.div variants={fadeUp} className="border-l-2 border-blue-500 pl-5 py-1">
              <div className="text-[14px] font-medium text-neutral-900">
                3 Champions showing churn signals
              </div>
              <p className="text-[13px] text-neutral-400 mt-1 leading-relaxed">
                Sarah K., Mike R., and Lisa M. — combined $7,400 LTV. Agent has drafted personalized offers.
              </p>
              <div className="flex gap-3 mt-3">
                <button className="text-[12px] font-medium px-4 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">
                  Approve All
                </button>
                <button className="text-[12px] font-medium text-neutral-500 hover:text-neutral-900 transition-colors">
                  Review individually
                </button>
              </div>
            </motion.div>

            {/* At-Risk Customers — expandable rows */}
            <motion.div variants={fadeUp}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[12px] text-neutral-400 uppercase tracking-[0.08em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>At-risk customers</h2>
                <button className="text-[12px] text-blue-600 hover:text-blue-700 transition-colors">View all</button>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[11px] text-neutral-400 uppercase tracking-[0.05em] border-b border-neutral-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <div className="col-span-4">Customer</div>
                <div className="col-span-2 text-right">Risk</div>
                <div className="col-span-2 text-right">LTV</div>
                <div className="col-span-2 text-right">Last order</div>
                <div className="col-span-2 text-right">Segment</div>
              </div>

              {[
                { name: "Sarah Kowalski", risk: 94, ltv: "$2,400", days: "67d", seg: "At Risk", prev: "Champion", email: "sarah@email.com" },
                { name: "Mike Rodriguez", risk: 87, ltv: "$1,800", days: "52d", seg: "At Risk", prev: "Loyal", email: "mike@email.com" },
                { name: "Lisa Morgan", risk: 82, ltv: "$3,200", days: "48d", seg: "At Risk", prev: "Champion", email: "lisa@email.com" },
                { name: "David Chen", risk: 76, ltv: "$920", days: "41d", seg: "At Risk", prev: "Promising", email: "david@email.com" },
              ].map((c, i) => (
                <div key={i}>
                  <button
                    onClick={() => setExpandedCustomer(expandedCustomer === i ? null : i)}
                    className="grid grid-cols-12 gap-4 w-full px-4 py-3 text-left border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors items-center"
                  >
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-[11px] font-medium text-neutral-500">
                        {c.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium">{c.name}</div>
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-[13px] font-mono tabular-nums font-medium">{c.risk}%</span>
                    </div>
                    <div className="col-span-2 text-right text-[13px] font-mono tabular-nums text-neutral-600">{c.ltv}</div>
                    <div className="col-span-2 text-right text-[13px] text-neutral-400">{c.days}</div>
                    <div className="col-span-2 text-right">
                      <span className="text-[11px] font-mono text-neutral-400">
                        {c.prev} <span className="text-neutral-300">→</span> {c.seg}
                      </span>
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedCustomer === i && (
                      <motion.div
                        className="border-b border-neutral-50 bg-neutral-50/30"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-4 py-4 pl-14 flex items-center gap-4">
                          <div className="text-[12px] text-neutral-400">{c.email}</div>
                          <div className="flex-1" />
                          <button className="text-[12px] font-medium px-3 py-1 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">
                            Send Offer
                          </button>
                          <button className="text-[12px] font-medium px-3 py-1 rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors">
                            View Profile
                          </button>
                          <button className="text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors">
                            Ignore
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </motion.div>

            {/* Agent Activity — timeline */}
            <motion.div variants={fadeUp}>
              <h2 className="text-[12px] text-neutral-400 uppercase tracking-[0.08em] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Activity</h2>
              <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-neutral-100" />
                <div className="space-y-4">
                  {[
                    { action: "Sent win-back offer to Sarah K.", time: "3m ago", done: true, ch: "WhatsApp" },
                    { action: "Created segment: Holiday Shoppers 2025", time: "12m ago", done: true, ch: null },
                    { action: "Analyzing campaign performance...", time: "now", done: false, ch: "Email" },
                    { action: "Resolved conversation with Alex T.", time: "28m ago", done: true, ch: "SMS" },
                    { action: "Generated re-engagement email draft", time: "1h ago", done: true, ch: "Email" },
                  ].map((item, i) => (
                    <div key={i} className="relative flex items-start gap-4">
                      <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center" style={{ background: item.done ? "#171717" : "#fff", borderColor: item.done ? "#171717" : "#d4d4d4" }}>
                        {!item.done && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="text-[13px] text-neutral-700">{item.action}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.ch && (
                            <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                              {item.ch}
                            </span>
                          )}
                          <span className="text-[11px] text-neutral-300">{item.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right (1 col) */}
          <div className="space-y-8">
            {/* Segments */}
            <motion.div variants={fadeUp}>
              <h3 className="text-[12px] text-neutral-400 uppercase tracking-[0.08em] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Segments</h3>
              <div className="space-y-4">
                {[
                  { name: "Champions", count: 342, pct: 28 },
                  { name: "Loyal", count: 456, pct: 37 },
                  { name: "Promising", count: 198, pct: 16 },
                  { name: "At Risk", count: 156, pct: 13 },
                  { name: "Lost", count: 73, pct: 6 },
                ].map((seg) => (
                  <div key={seg.name} className="flex items-center gap-3 cursor-pointer group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-medium text-neutral-700 group-hover:text-neutral-900 transition-colors">{seg.name}</span>
                        <span className="text-[12px] font-mono tabular-nums text-neutral-400">{seg.count}</span>
                      </div>
                      <div className="h-1 rounded-full bg-neutral-100 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-neutral-900"
                          initial={{ width: 0 }}
                          animate={{ width: `${seg.pct}%` }}
                          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                          style={{ opacity: 0.15 + (seg.pct / 100) * 0.6 }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Automations */}
            <motion.div variants={fadeUp}>
              <h3 className="text-[12px] text-neutral-400 uppercase tracking-[0.08em] mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Automations</h3>
              <div className="space-y-2">
                {[
                  { name: "Win-Back", active: true, stat: "47 sent" },
                  { name: "Welcome Series", active: true, stat: "234 sent" },
                  { name: "Post-Purchase", active: false, stat: "Paused" },
                  { name: "Abandoned Cart", active: true, stat: "18 sent" },
                ].map((auto, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-neutral-50 -mx-2 px-2 rounded-lg transition-colors">
                    <div className={`w-1.5 h-1.5 rounded-full ${auto.active ? "bg-neutral-900" : "bg-neutral-200"}`} />
                    <span className="text-[13px] flex-1 text-neutral-700">{auto.name}</span>
                    <span className="text-[11px] font-mono text-neutral-300">{auto.stat}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Empty State */}
            <motion.div variants={fadeUp} className="border border-dashed border-neutral-200 rounded-xl p-8 text-center">
              <Mail className="w-5 h-5 text-neutral-200 mx-auto mb-3" />
              <p className="text-[13px] text-neutral-500">No campaigns</p>
              <p className="text-[12px] text-neutral-300 mt-1">Agent can draft one for you.</p>
              <button className="mt-4 text-[12px] font-medium px-4 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors inline-flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Draft Campaign
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
