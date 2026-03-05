"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownRight,
  Users,
  DollarSign,
  ShieldAlert,
  MessageSquare,
  Mail,
  Phone,
  Globe,
  ChevronRight,
  Sparkles,
  Bell,
  Search,
  Command,
  CheckCircle,
  ArrowLeft,
  Target,
  Layers,
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
    const controls = animate(motionVal, value, {
      duration,
      ease: "easeOut",
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value]);

  return <span className={className}>{display}</span>;
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  color = "#6B7A2F",
  width = 60,
  height = 20,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block ml-2 opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pulse Dot
// ---------------------------------------------------------------------------

function PulseDot({ color = "bg-emerald-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-40`}
      />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Concept
// ---------------------------------------------------------------------------

const channelColors: Record<string, { bg: string; text: string; icon: typeof Phone }> = {
  whatsapp: { bg: "bg-green-500/10", text: "text-green-600", icon: Phone },
  sms: { bg: "bg-blue-500/10", text: "text-blue-600", icon: MessageSquare },
  email: { bg: "bg-purple-500/10", text: "text-purple-600", icon: Mail },
  widget: { bg: "bg-amber-500/10", text: "text-amber-600", icon: Globe },
};

const segmentColors: Record<string, { bg: string; text: string; dot: string }> = {
  Champions: { bg: "bg-amber-500/10", text: "text-amber-700", dot: "bg-amber-500" },
  Loyal: { bg: "bg-[#6B7A2F]/10", text: "text-[#6B7A2F]", dot: "bg-[#6B7A2F]" },
  "At Risk": { bg: "bg-[#c4704a]/10", text: "text-[#c4704a]", dot: "bg-[#c4704a]" },
  Promising: { bg: "bg-cyan-500/10", text: "text-cyan-700", dot: "bg-cyan-500" },
  Lost: { bg: "bg-gray-400/10", text: "text-gray-500", dot: "bg-gray-400" },
};

export default function ConceptA() {
  const [revenueSaved, setRevenueSaved] = useState(12340);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  // Simulate revenue ticking up
  useEffect(() => {
    const interval = setInterval(() => {
      setRevenueSaved((v) => v + Math.floor(Math.random() * 15) + 5);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
      if (e.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
  };

  return (
    <div
      className="min-h-screen relative"
      style={{
        background: "#faf8f5",
        fontFamily: "'Inter', sans-serif",
        color: "#2c2418",
      }}
    >
      {/* ── Command Palette Overlay ── */}
      <AnimatePresence>
        {commandOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="fixed inset-0 bg-black/20 backdrop-blur-sm"
              onClick={() => setCommandOpen(false)}
            />
            <motion.div
              className="relative w-[560px] bg-white rounded-2xl shadow-2xl border border-black/5 overflow-hidden"
              initial={{ scale: 0.95, opacity: 0, y: -10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-black/5">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  autoFocus
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400"
                  placeholder="Search customers, run actions, ask the agent..."
                />
                <kbd className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                  ESC
                </kbd>
              </div>
              <div className="p-2">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider px-3 py-2">
                  Quick Actions
                </div>
                {[
                  { icon: Sparkles, label: "Ask the Agent", hint: "Natural language" },
                  { icon: Users, label: "Search Customers", hint: "@ to filter" },
                  { icon: Layers, label: "Jump to Segment", hint: "# to filter" },
                  { icon: Mail, label: "Create Campaign", hint: "> for commands" },
                  { icon: Target, label: "View Churn Risk Report", hint: "" },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#c4704a]/5 cursor-pointer transition-colors"
                  >
                    <item.icon className="w-4 h-4 text-gray-500" />
                    <span className="text-sm flex-1">{item.label}</span>
                    <span className="text-[11px] font-mono text-gray-400">{item.hint}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Bar ── */}
      <motion.div
        className="sticky top-0 z-40 border-b border-black/5"
        style={{ background: "rgba(250, 248, 245, 0.85)", backdropFilter: "blur(20px) saturate(1.2)" }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-4 px-6 py-3">
          {/* Back link */}
          <a
            href="/design-concepts"
            className="text-xs font-mono text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Concepts
          </a>

          <div className="flex-1" />

          {/* Agent Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#6B7A2F]/8 border border-[#6B7A2F]/15">
            <PulseDot color="bg-[#6B7A2F]" />
            <span className="text-[11px] font-mono text-[#6B7A2F]/80">
              Agent monitoring 2,340 customers
            </span>
            <span className="text-[10px] font-mono text-[#6B7A2F]/50">
              Last action 3m ago
            </span>
          </div>

          {/* Revenue Counter */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/8 border border-amber-500/15">
            <DollarSign className="w-3.5 h-3.5 text-amber-600" />
            <AnimatedCounter
              value={revenueSaved}
              prefix="$"
              className="text-[12px] font-mono font-bold text-amber-700 tabular-nums"
              duration={0.8}
            />
            <span className="text-[10px] font-mono text-amber-600/50">saved this month</span>
          </div>

          {/* Command Palette Trigger */}
          <button
            onClick={() => setCommandOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/3 hover:bg-black/5 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] text-gray-400">Search...</span>
            <kbd className="text-[10px] font-mono text-gray-300 bg-white/80 px-1.5 py-0.5 rounded border border-black/5">
              <Command className="w-2.5 h-2.5 inline" />K
            </kbd>
          </button>

          {/* Notification Bell */}
          <button className="relative p-2 rounded-lg hover:bg-black/3 transition-colors">
            <Bell className="w-4 h-4 text-gray-500" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#c4704a]" />
          </button>
        </div>
      </motion.div>

      {/* ── Main Content ── */}
      <motion.div
        className="max-w-[1200px] mx-auto px-6 py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Morning Briefing */}
        <motion.div variants={itemVariants} className="mb-8">
          <h1
            className="text-[28px] font-bold tracking-[-0.03em]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Good morning, Ujjawal
          </h1>
          <p className="text-[14px] text-gray-500 mt-1">
            Your agent handled <strong className="text-[#2c2418]">23 customer interactions</strong> overnight
            and saved <strong className="text-[#6B7A2F]">$890</strong> in potential churn.
          </p>
        </motion.div>

        {/* KPI Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Revenue Saved",
              value: 12340,
              prefix: "$",
              change: "+18%",
              up: true,
              spark: [2, 4, 3, 7, 5, 8, 12, 10, 14, 12, 16],
              color: "#B8963E",
            },
            {
              label: "Customers Retained",
              value: 234,
              change: "+12%",
              up: true,
              spark: [10, 14, 12, 18, 15, 20, 22, 19, 24, 21, 23],
              color: "#6B7A2F",
            },
            {
              label: "Churn Alerts",
              value: 7,
              change: "-3",
              up: false,
              spark: [12, 10, 8, 9, 7, 8, 6, 7, 5, 7, 7],
              color: "#c4704a",
            },
            {
              label: "Agent Actions",
              value: 156,
              change: "+34",
              up: true,
              spark: [5, 8, 12, 10, 15, 14, 18, 20, 16, 19, 22],
              color: "#7c3aed",
            },
          ].map((kpi, i) => (
            <motion.div
              key={i}
              className="group relative rounded-2xl p-5 border border-black/5 transition-all duration-300 hover:-translate-y-0.5 cursor-default"
              style={{ background: "rgba(255,255,255,0.6)", backdropFilter: "blur(20px)" }}
              whileHover={{ boxShadow: "0 8px 30px rgba(0,0,0,0.04)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] font-mono uppercase tracking-[0.1em] text-gray-400"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {kpi.label}
                </span>
                <Sparkline data={kpi.spark} color={kpi.color} />
              </div>
              <div className="flex items-end gap-3">
                <AnimatedCounter
                  value={kpi.value}
                  prefix={kpi.prefix || ""}
                  className="text-[28px] font-bold tracking-[-0.03em] tabular-nums"
                />
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full mb-1 ${
                    kpi.up
                      ? "bg-[#6B7A2F]/10 text-[#6B7A2F]"
                      : "bg-[#c4704a]/10 text-[#c4704a]"
                  }`}
                >
                  {kpi.up ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {kpi.change}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Two-column layout */}
        <div className="grid grid-cols-5 gap-6">
          {/* Left: Main content (3 cols) */}
          <div className="col-span-3 space-y-6">
            {/* Priority Alert */}
            <motion.div
              variants={itemVariants}
              className="rounded-2xl border border-[#c4704a]/20 p-5 relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(196,112,74,0.04) 0%, rgba(196,112,74,0.01) 100%)" }}
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-[#c4704a]" />
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#c4704a]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4 text-[#c4704a]" />
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">
                    3 Champions showing churn signals
                  </div>
                  <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">
                    Sarah K. ($2,400 LTV), Mike R. ($1,800 LTV), and Lisa M. ($3,200 LTV) haven&apos;t
                    purchased in 45+ days. The agent has drafted personalized win-back offers for each.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button className="text-[11px] font-mono font-semibold px-3.5 py-1.5 rounded-lg bg-[#2c2418] text-[#faf8f5] hover:bg-[#2c2418]/90 transition-colors">
                      Preview & Approve
                    </button>
                    <button className="text-[11px] font-mono font-semibold px-3.5 py-1.5 rounded-lg bg-black/3 hover:bg-black/5 transition-colors">
                      Review Each
                    </button>
                    <button className="text-[11px] font-mono text-gray-400 px-3.5 py-1.5 rounded-lg hover:bg-black/3 transition-colors">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Agent Activity Feed */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between mb-3">
                <h2
                  className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-gray-400"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  Agent Activity
                </h2>
                <span className="text-[10px] font-mono text-gray-300">Live</span>
              </div>
              <div className="space-y-2">
                {[
                  {
                    status: "completed",
                    action: "Sent win-back offer to Sarah K.",
                    channel: "whatsapp",
                    time: "3m ago",
                    detail: "20% discount · Merino Wool Sweater",
                  },
                  {
                    status: "completed",
                    action: "Created segment: Holiday Shoppers 2025",
                    channel: null,
                    time: "12m ago",
                    detail: "142 customers matched",
                  },
                  {
                    status: "running",
                    action: "Analyzing campaign performance...",
                    channel: "email",
                    time: "now",
                    detail: "Winter Sale Recap · 2,340 recipients",
                  },
                  {
                    status: "completed",
                    action: "Resolved conversation with Alex T.",
                    channel: "sms",
                    time: "28m ago",
                    detail: "Order tracking question · Avg response: 1.2s",
                  },
                  {
                    status: "completed",
                    action: "Generated re-engagement email draft",
                    channel: "email",
                    time: "1h ago",
                    detail: "Targeting 89 hibernating customers",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="group flex items-start gap-3 p-3 rounded-xl border border-transparent hover:border-black/5 hover:bg-white/60 transition-all cursor-pointer"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i + 0.5, duration: 0.4 }}
                  >
                    {item.status === "completed" ? (
                      <CheckCircle className="w-4 h-4 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                    ) : (
                      <div className="mt-0.5 flex-shrink-0">
                        <PulseDot color="bg-amber-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">{item.action}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.channel && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              channelColors[item.channel]?.bg
                            } ${channelColors[item.channel]?.text}`}
                          >
                            {item.channel}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400">{item.detail}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-gray-300 flex-shrink-0">
                      {item.time}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Customer Risk Cards (Spatial transition demo) */}
            <motion.div variants={itemVariants}>
              <div className="flex items-center justify-between mb-3">
                <h2
                  className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-gray-400"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  At-Risk Customers
                </h2>
                <button className="text-[11px] font-mono text-[#c4704a] hover:underline">
                  View all 7
                </button>
              </div>
              <div className="space-y-2">
                {[
                  {
                    name: "Sarah K.",
                    risk: 94,
                    ltv: "$2,400",
                    lastOrder: "67 days",
                    segment: "Champions",
                    segmentPrev: "Champion",
                    segmentNow: "At Risk",
                  },
                  {
                    name: "Mike R.",
                    risk: 87,
                    ltv: "$1,800",
                    lastOrder: "52 days",
                    segment: "Loyal",
                    segmentPrev: "Loyal",
                    segmentNow: "At Risk",
                  },
                  {
                    name: "Lisa M.",
                    risk: 82,
                    ltv: "$3,200",
                    lastOrder: "48 days",
                    segment: "Champions",
                    segmentPrev: "Champion",
                    segmentNow: "At Risk",
                  },
                ].map((cust, i) => (
                  <motion.div
                    key={i}
                    className="group rounded-xl border border-black/5 p-4 hover:border-[#c4704a]/20 transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                    style={{
                      background: "rgba(255,255,255,0.5)",
                      backdropFilter: "blur(12px)",
                    }}
                    whileHover={{ boxShadow: "0 4px 20px rgba(196,112,74,0.06)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#c4704a]/10 flex items-center justify-center text-[12px] font-bold font-mono text-[#c4704a]">
                        {cust.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold">{cust.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#c4704a]/10 text-[#c4704a] font-semibold">
                            {cust.risk}% risk
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          LTV: {cust.ltv} · Last order: {cust.lastOrder} ago ·{" "}
                          <span className="text-[#6B7A2F]">{cust.segmentPrev}</span>
                          {" → "}
                          <span className="text-[#c4704a]">{cust.segmentNow}</span>
                        </div>
                      </div>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-[#2c2418] text-[#faf8f5]">
                          Send Offer
                        </button>
                        <button className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-black/3 hover:bg-black/5 transition-colors">
                          View
                        </button>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right: Sidebar panels (2 cols) */}
          <div className="col-span-2 space-y-6">
            {/* Conversations (with spatial slide) */}
            <motion.div
              variants={itemVariants}
              className="rounded-2xl border border-black/5 overflow-hidden"
              style={{ background: "rgba(255,255,255,0.5)", backdropFilter: "blur(20px)" }}
            >
              <AnimatePresence mode="wait">
                {selectedConvo ? (
                  <motion.div
                    key="detail"
                    initial={{ x: 50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 50, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5">
                      <button
                        onClick={() => setSelectedConvo(null)}
                        className="p-1 hover:bg-black/3 rounded transition-colors"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <Phone className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-sm font-semibold">Sarah K.</span>
                      <span className="text-[10px] font-mono text-gray-400 ml-auto">WhatsApp</span>
                    </div>
                    <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto">
                      <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-bl-sm bg-gray-100 text-[13px]">
                        Hi, I haven&apos;t received my order yet. It&apos;s been 2 weeks.
                        <div className="text-[10px] text-gray-400 mt-1 font-mono">Customer · 2m ago</div>
                      </div>
                      <div className="max-w-[85%] ml-auto px-3 py-2 rounded-xl rounded-br-sm bg-[#2c2418] text-[#faf8f5] text-[13px]">
                        Hi Sarah! Let me check on order #4821 for you right away.
                        <div className="flex gap-1 mt-1.5">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/10 text-[9px] font-mono">
                            <span className="w-1 h-1 rounded-full bg-emerald-400" />
                            lookup order
                          </span>
                        </div>
                        <div className="text-[10px] text-white/40 mt-1 font-mono">Agent · 2m ago</div>
                      </div>
                      <div className="max-w-[85%] ml-auto px-3 py-2 rounded-xl rounded-br-sm bg-[#2c2418] text-[#faf8f5] text-[13px]">
                        Great news! Your order shipped 3 days ago via FedEx. Tracking: FX928374. It should arrive by Thursday.
                        <div className="text-[10px] text-white/40 mt-1 font-mono">Agent · 1m ago</div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -50, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-black/5">
                      <MessageSquare className="w-4 h-4 text-[#c4704a]" />
                      <span
                        className="text-[11px] font-mono uppercase tracking-[0.1em] font-bold"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        Conversations
                      </span>
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] font-mono font-bold">
                        2 escalated
                      </span>
                    </div>
                    {[
                      {
                        id: "1",
                        name: "Sarah K.",
                        channel: "whatsapp",
                        msg: "Hi, I haven't received my order...",
                        time: "2m",
                        status: "active",
                      },
                      {
                        id: "2",
                        name: "Alex T.",
                        channel: "sms",
                        msg: "Can I return my purchase?",
                        time: "8m",
                        status: "escalated",
                      },
                      {
                        id: "3",
                        name: "Jordan P.",
                        channel: "widget",
                        msg: "Do you have the blue version?",
                        time: "15m",
                        status: "active",
                      },
                      {
                        id: "4",
                        name: "Emma L.",
                        channel: "email",
                        msg: "I'd like to change my shipping...",
                        time: "1h",
                        status: "resolved",
                      },
                    ].map((convo) => {
                      const ch = channelColors[convo.channel];
                      const Icon = ch?.icon || Globe;
                      return (
                        <button
                          key={convo.id}
                          onClick={() => setSelectedConvo(convo.id)}
                          className="w-full text-left px-4 py-3 border-b border-black/3 hover:bg-[#c4704a]/3 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${ch?.bg}`}>
                              <Icon className={`w-3 h-3 ${ch?.text}`} />
                            </div>
                            <span className="text-[13px] font-medium flex-1 truncate">
                              {convo.name}
                            </span>
                            <span className="text-[10px] font-mono text-gray-300">
                              {convo.time}
                            </span>
                          </div>
                          <div className="text-[12px] text-gray-400 mt-1 truncate pl-8">
                            {convo.msg}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 pl-8">
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-semibold ${
                                convo.status === "escalated"
                                  ? "bg-red-500/10 text-red-500"
                                  : convo.status === "active"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              {convo.status}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Segment Distribution */}
            <motion.div
              variants={itemVariants}
              className="rounded-2xl border border-black/5 p-5"
              style={{ background: "rgba(255,255,255,0.5)", backdropFilter: "blur(20px)" }}
            >
              <h3
                className="text-[11px] font-mono uppercase tracking-[0.12em] font-bold text-gray-400 mb-4"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Customer Segments
              </h3>
              <div className="space-y-3">
                {[
                  { name: "Champions", count: 342, pct: 28, trend: "+12" },
                  { name: "Loyal", count: 456, pct: 37, trend: "+5" },
                  { name: "Promising", count: 198, pct: 16, trend: "+8" },
                  { name: "At Risk", count: 156, pct: 13, trend: "-3" },
                  { name: "Lost", count: 73, pct: 6, trend: "-4" },
                ].map((seg) => {
                  const color = segmentColors[seg.name];
                  return (
                    <div key={seg.name} className="group cursor-pointer">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${color?.dot}`} />
                          <span className="text-[12px] font-medium">{seg.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-gray-400 tabular-nums">
                            {seg.count}
                          </span>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              seg.trend.startsWith("+") ? "text-[#6B7A2F]" : "text-[#c4704a]"
                            }`}
                          >
                            {seg.trend}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/3 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${color?.dot}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${seg.pct}%` }}
                          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                          style={{ opacity: 0.6 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Quick Empty State Example */}
            <motion.div
              variants={itemVariants}
              className="rounded-2xl border border-dashed border-black/10 p-8 text-center"
            >
              <div className="w-10 h-10 rounded-full bg-[#c4704a]/5 flex items-center justify-center mx-auto mb-3">
                <Mail className="w-5 h-5 text-[#c4704a]/30" />
              </div>
              <p className="text-[13px] font-medium text-gray-500">No campaigns running</p>
              <p className="text-[11px] text-gray-400 mt-1 max-w-[200px] mx-auto">
                The agent can draft one based on your current segments.
              </p>
              <button className="mt-3 text-[11px] font-mono font-semibold px-4 py-1.5 rounded-lg bg-[#2c2418] text-[#faf8f5] hover:bg-[#2c2418]/90 transition-colors inline-flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Let Agent Draft One
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
