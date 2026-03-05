"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Sparkles,
  Bell,
  Command,
  CheckCircle,
  ArrowLeft,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Concept F: Command Center
// Agent as floating overlay + bottom command bar
// Light neutral theme — Linear/Vercel inspired
// ---------------------------------------------------------------------------

export default function ConceptF() {
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentExpanded, setAgentExpanded] = useState(false);
  const [commandFocused, setCommandFocused] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cmd+K focuses command bar
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setCommandFocused(true);
      }
      if (e.key === "Escape") {
        setCommandFocused(false);
        setAgentOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleSubmit = () => {
    if (input.trim()) {
      setAgentOpen(true);
      setInput("");
    }
  };

  const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } };
  const fadeUp = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } } };

  return (
    <div className="h-screen flex flex-col relative" style={{ background: "#ffffff", color: "#111111", fontFamily: "'Inter', sans-serif" }}>

      {/* ── AGENT FLOATING OVERLAY ── */}
      <AnimatePresence>
        {agentOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40"
              style={{ background: "rgba(0,0,0,0.03)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!agentExpanded) setAgentOpen(false); }}
            />
            <motion.div
              className={`fixed z-50 bg-white border border-neutral-200 overflow-hidden flex flex-col ${
                agentExpanded
                  ? "inset-4 rounded-2xl shadow-[0_25px_100px_rgba(0,0,0,0.15)]"
                  : "bottom-20 right-6 w-[420px] h-[520px] rounded-2xl shadow-[0_16px_70px_rgba(0,0,0,0.12)]"
              }`}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              layout
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-4 h-11 border-b border-neutral-100 flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[12px] font-semibold">Allo Agent</span>
                <span className="relative flex h-1.5 w-1.5 ml-0.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <div className="flex-1" />
                <button onClick={() => setAgentExpanded(!agentExpanded)} className="p-1 rounded hover:bg-neutral-100 transition-colors">
                  {agentExpanded ? <Minimize2 className="w-3.5 h-3.5 text-neutral-400" /> : <Maximize2 className="w-3.5 h-3.5 text-neutral-400" />}
                </button>
                <button onClick={() => { setAgentOpen(false); setAgentExpanded(false); }} className="p-1 rounded hover:bg-neutral-100 transition-colors">
                  <X className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Agent greeting */}
                <div className="space-y-3">
                  <div className="text-[13px] leading-relaxed text-neutral-600">
                    Good morning. I handled <strong className="text-neutral-900">23 interactions</strong> overnight and saved <strong className="text-neutral-900">$890</strong> in churn.
                  </div>

                  {/* Inline KPI strip */}
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {[
                      { label: "Saved", val: "$12,340", ch: "+18%", up: true },
                      { label: "Retained", val: "234", ch: "+12%", up: true },
                      { label: "Alerts", val: "7", ch: "-3", up: false },
                    ].map((k, i) => (
                      <div key={i} className="flex-shrink-0 px-3 py-2 rounded-lg border border-neutral-100 bg-neutral-50/50">
                        <div className="text-[9px] font-mono uppercase tracking-wider text-neutral-400">{k.label}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[16px] font-semibold tabular-nums tracking-tight">{k.val}</span>
                          <span className={`text-[10px] font-mono ${k.up ? "text-emerald-600" : "text-blue-600"}`}>
                            {k.up ? <ArrowUpRight className="w-2.5 h-2.5 inline" /> : <ArrowDownRight className="w-2.5 h-2.5 inline" />} {k.ch}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[13px] leading-relaxed text-neutral-600">
                    Priority: <strong className="text-neutral-900">3 Champions</strong> are at churn risk. I&apos;ve prepared win-back offers.
                  </div>

                  <div className="flex gap-2">
                    <button className="text-[12px] font-medium px-3.5 py-1.5 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 transition-colors">Approve All</button>
                    <button className="text-[12px] font-medium px-3.5 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors">Review Each</button>
                  </div>
                </div>

                {/* User query */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] px-3.5 py-2 rounded-2xl rounded-br-sm bg-neutral-900 text-white text-[13px]">
                    Show me who&apos;s about to churn
                  </div>
                </div>

                {/* Tool indicators */}
                <div className="flex gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-[10px] font-mono text-neutral-500">
                    <CheckCircle className="w-2.5 h-2.5 text-emerald-500" /> query segments
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-[10px] font-mono text-neutral-500">
                    <CheckCircle className="w-2.5 h-2.5 text-emerald-500" /> get churn risk
                  </span>
                </div>

                {/* Customer cards */}
                <div className="space-y-1.5">
                  <div className="text-[13px] text-neutral-600">Your 3 highest-risk customers:</div>
                  {[
                    { name: "Sarah K.", risk: 94, ltv: "$2,400", days: "67d" },
                    { name: "Mike R.", risk: 87, ltv: "$1,800", days: "52d" },
                    { name: "Lisa M.", risk: 82, ltv: "$3,200", days: "48d" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-neutral-100 hover:border-neutral-200 transition-colors cursor-pointer group">
                      <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-semibold text-neutral-500">{c.name.split(" ").map(n=>n[0]).join("")}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium">{c.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-600">{c.risk}%</span>
                        </div>
                        <div className="text-[10px] text-neutral-400">LTV: {c.ltv} · Last order: {c.days}</div>
                      </div>
                      <button className="text-[10px] font-medium px-2 py-1 rounded bg-neutral-900 text-white opacity-0 group-hover:opacity-100 transition-opacity">Send Offer</button>
                    </div>
                  ))}
                </div>

                <div ref={messagesEndRef} />
              </div>

              {/* Input inside overlay */}
              <div className="p-3 border-t border-neutral-100">
                <div className="flex gap-2">
                  <input placeholder="Continue conversation..." className="flex-1 text-[13px] px-3 py-2 rounded-lg border border-neutral-200 bg-white outline-none focus:border-blue-500/30 transition-colors" />
                  <button className="p-2 rounded-lg bg-neutral-900 text-white"><Send className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── TOP BAR ── */}
      <div className="flex items-center gap-6 px-6 h-12 border-b border-neutral-100 flex-shrink-0">
        <a href="/design-concepts" className="text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back
        </a>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40 animate-ping" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" /></span>
          <span className="text-[11px] text-neutral-400">Agent active</span>
        </div>
        <div className="w-px h-4 bg-neutral-200" />
        <span className="text-[12px] font-semibold tabular-nums">$12,340 <span className="text-neutral-400 font-normal">saved</span></span>
        <button className="relative"><Bell className="w-4 h-4 text-neutral-400" /><span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500" /></button>
      </div>

      {/* ── MAIN DASHBOARD ── */}
      <div className="flex-1 overflow-y-auto">
        <motion.div className="max-w-[1000px] mx-auto px-6 py-10" variants={stagger} initial="hidden" animate="visible">
          <motion.div variants={fadeUp} className="mb-10">
            <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Good morning</h1>
            <p className="text-[14px] text-neutral-400 mt-1">23 interactions handled · $890 saved overnight</p>
          </motion.div>

          {/* KPIs */}
          <motion.div variants={fadeUp} className="grid grid-cols-4 gap-4 mb-10">
            {[
              { label: "Revenue Saved", val: "$12,340", ch: "+18%", up: true },
              { label: "Retained", val: "234", ch: "+12%", up: true },
              { label: "Churn Alerts", val: "7", ch: "-3", up: false },
              { label: "Agent Actions", val: "156", ch: "+34", up: true },
            ].map((k, i) => (
              <div key={i} className="p-5 rounded-xl border border-neutral-100 hover:border-neutral-200 transition-all hover:-translate-y-0.5 cursor-default">
                <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-neutral-400 mb-3">{k.label}</div>
                <div className="text-[26px] font-semibold tracking-[-0.03em] tabular-nums">{k.val}</div>
                <div className={`text-[11px] mt-1 ${k.up ? "text-neutral-600" : "text-blue-600"}`}>
                  {k.up ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />} {k.ch}
                </div>
              </div>
            ))}
          </motion.div>

          <div className="grid grid-cols-3 gap-8">
            <div className="col-span-2 space-y-8">
              {/* Alert */}
              <motion.div variants={fadeUp} className="border-l-2 border-blue-500 pl-5 py-1">
                <div className="text-[14px] font-medium">3 Champions at risk</div>
                <p className="text-[13px] text-neutral-400 mt-1">Agent has offers ready. <button className="text-blue-600 hover:underline" onClick={() => setAgentOpen(true)}>Review in Agent</button></p>
              </motion.div>

              {/* Activity */}
              <motion.div variants={fadeUp}>
                <h2 className="text-[11px] font-mono uppercase tracking-[0.08em] text-neutral-400 mb-3">Recent Activity</h2>
                <div className="space-y-1">
                  {[
                    { action: "Win-back sent to Sarah K.", ch: "WhatsApp", time: "3m", done: true },
                    { action: "Segment created: Holiday Shoppers", ch: null, time: "12m", done: true },
                    { action: "Campaign analysis running...", ch: "Email", time: "now", done: false },
                    { action: "Conversation resolved: Alex T.", ch: "SMS", time: "28m", done: true },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 border-b border-neutral-50 last:border-0 cursor-pointer hover:bg-neutral-50/50 -mx-2 px-2 rounded-lg transition-colors">
                      {item.done ? <CheckCircle className="w-3.5 h-3.5 text-neutral-300" /> : <span className="relative flex h-3.5 w-3.5 items-center justify-center"><span className="absolute inline-flex h-2 w-2 rounded-full bg-blue-500 opacity-40 animate-ping" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" /></span>}
                      <span className="text-[13px] flex-1 text-neutral-700">{item.action}</span>
                      {item.ch && <span className="text-[10px] font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-400">{item.ch}</span>}
                      <span className="text-[10px] text-neutral-300 font-mono">{item.time}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* At-risk */}
              <motion.div variants={fadeUp}>
                <h2 className="text-[11px] font-mono uppercase tracking-[0.08em] text-neutral-400 mb-3">At-Risk Customers</h2>
                <div className="space-y-1.5">
                  {[
                    { name: "Sarah K.", risk: 94, ltv: "$2,400", days: "67d" },
                    { name: "Mike R.", risk: 87, ltv: "$1,800", days: "52d" },
                    { name: "Lisa M.", risk: 82, ltv: "$3,200", days: "48d" },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-100 hover:border-neutral-200 transition-all cursor-pointer group">
                      <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-[11px] font-medium text-neutral-500">{c.name.split(" ").map(n=>n[0]).join("")}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2"><span className="text-[13px] font-medium">{c.name}</span><span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-50 text-red-600">{c.risk}%</span></div>
                        <span className="text-[11px] text-neutral-400">LTV: {c.ltv} · {c.days}</span>
                      </div>
                      <button className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-neutral-900 text-white opacity-0 group-hover:opacity-100 transition-opacity">Send Offer</button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Right column */}
            <div className="space-y-8">
              <motion.div variants={fadeUp}>
                <h3 className="text-[11px] font-mono uppercase tracking-[0.08em] text-neutral-400 mb-3">Segments</h3>
                {[
                  { name: "Champions", count: 342, pct: 28 },
                  { name: "Loyal", count: 456, pct: 37 },
                  { name: "Promising", count: 198, pct: 16 },
                  { name: "At Risk", count: 156, pct: 13 },
                  { name: "Lost", count: 73, pct: 6 },
                ].map((s) => (
                  <div key={s.name} className="flex items-center gap-3 py-2 cursor-pointer group">
                    <span className="text-[12px] flex-1 text-neutral-600 group-hover:text-neutral-900 transition-colors">{s.name}</span>
                    <span className="text-[11px] font-mono text-neutral-300 tabular-nums">{s.count}</span>
                    <div className="w-16 h-1 rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-neutral-900 transition-all" style={{ width: `${s.pct}%`, opacity: 0.15 + (s.pct / 100) * 0.6 }} />
                    </div>
                  </div>
                ))}
              </motion.div>

              <motion.div variants={fadeUp}>
                <h3 className="text-[11px] font-mono uppercase tracking-[0.08em] text-neutral-400 mb-3">Conversations</h3>
                {[
                  { name: "Sarah K.", ch: "WhatsApp", status: "active", time: "2m" },
                  { name: "Alex T.", ch: "SMS", status: "escalated", time: "8m" },
                  { name: "Jordan P.", ch: "Widget", status: "active", time: "15m" },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-2 py-2 cursor-pointer hover:bg-neutral-50 -mx-2 px-2 rounded-lg transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full ${c.status === "escalated" ? "bg-red-500" : "bg-emerald-500"}`} />
                    <span className="text-[12px] flex-1">{c.name}</span>
                    <span className="text-[10px] font-mono text-neutral-300">{c.ch}</span>
                    <span className="text-[10px] text-neutral-300">{c.time}</span>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── BOTTOM COMMAND BAR ── */}
      <div className={`border-t transition-all duration-200 ${commandFocused ? "border-blue-500/30 shadow-[0_-4px_20px_rgba(37,99,235,0.05)]" : "border-neutral-100"}`}>
        <div className="max-w-[700px] mx-auto px-4 py-3 flex items-center gap-3">
          <Sparkles className={`w-4 h-4 transition-colors ${commandFocused ? "text-blue-600" : "text-neutral-300"}`} />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setCommandFocused(true)}
            onBlur={() => setCommandFocused(false)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="Ask the agent anything, or search..."
            className="flex-1 text-[14px] bg-transparent outline-none placeholder:text-neutral-300"
          />
          <kbd className="text-[10px] font-mono text-neutral-300 bg-neutral-100 px-1.5 py-0.5 rounded"><Command className="w-2.5 h-2.5 inline" />K</kbd>
          {input.trim() && (
            <button onClick={handleSubmit} className="p-1.5 rounded-lg bg-neutral-900 text-white"><Send className="w-3.5 h-3.5" /></button>
          )}
        </div>
      </div>
    </div>
  );
}
