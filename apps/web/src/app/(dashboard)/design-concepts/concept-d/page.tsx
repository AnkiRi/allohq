"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Sparkles,
  Bell,
  Search,
  Command,
  ArrowLeft,
  Users,
  DollarSign,
  ShieldAlert,
  Phone,
  MessageSquare,
  Mail,
  Zap,
  AlertTriangle,
  TrendingUp,
  Activity,
} from "lucide-react";

// ---------------------------------------------------------------------------
// The agent-first concept: The AI conversation IS the dashboard
// ---------------------------------------------------------------------------

type MessageType = {
  id: string;
  role: "agent" | "user";
  content: string;
  cards?: CardType[];
  actions?: ActionType[];
  toolCalls?: string[];
  timestamp: string;
};

type CardType = {
  type: "kpi" | "customer" | "alert";
  data: Record<string, unknown>;
};

type ActionType = {
  label: string;
  variant: "primary" | "secondary" | "ghost";
};

function PulseDot({ color = "bg-emerald-500" }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-40`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  );
}

// KPI Card rendered inline in chat
function KpiCard({ label, value, change, up, icon: Icon }: { label: string; value: string; change: string; up: boolean; icon: typeof DollarSign }) {
  return (
    <div className="inline-flex flex-col p-4 rounded-xl border border-black/5 min-w-[140px]" style={{ background: "rgba(255,255,255,0.7)" }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5 text-[#c4704a]" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">{label}</span>
      </div>
      <span className="text-[22px] font-bold tracking-[-0.03em] tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
      <span className={`text-[11px] font-mono mt-1 flex items-center gap-0.5 ${up ? "text-[#6B7A2F]" : "text-[#c4704a]"}`}>
        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {change}
      </span>
    </div>
  );
}

// Customer risk card inline in chat
function CustomerCard({ name, risk, ltv, days, from, to }: { name: string; risk: number; ltv: string; days: string; from: string; to: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-black/5 hover:border-[#c4704a]/20 transition-all cursor-pointer group" style={{ background: "rgba(255,255,255,0.7)" }}>
      <div className="w-9 h-9 rounded-full bg-[#c4704a]/10 flex items-center justify-center text-[12px] font-bold font-mono text-[#c4704a]">
        {name.split(" ").map(n => n[0]).join("")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{name}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#c4704a]/10 text-[#c4704a] font-semibold">{risk}%</span>
        </div>
        <div className="text-[11px] text-gray-400">LTV: {ltv} · {days} ago · <span className="text-[#6B7A2F]">{from}</span> → <span className="text-[#c4704a]">{to}</span></div>
      </div>
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-[#2c2418] text-[#faf8f5]">Send Offer</button>
        <button className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-black/3">View</button>
      </div>
    </div>
  );
}

export default function ConceptD() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages: MessageType[] = [
    {
      id: "1",
      role: "agent",
      content: "Good morning, Ujjawal. Here's your overnight summary — I handled 23 customer interactions and saved $890 in potential churn.",
      timestamp: "8:02 AM",
    },
    {
      id: "2",
      role: "agent",
      content: "",
      cards: [
        { type: "kpi", data: { label: "Revenue Saved", value: "$12,340", change: "+18%", up: true, icon: "dollar" } },
        { type: "kpi", data: { label: "Retained", value: "234", change: "+12%", up: true, icon: "users" } },
        { type: "kpi", data: { label: "Churn Alerts", value: "7", change: "-3", up: false, icon: "alert" } },
        { type: "kpi", data: { label: "Actions", value: "156", change: "+34", up: true, icon: "zap" } },
      ],
      timestamp: "8:02 AM",
    },
    {
      id: "3",
      role: "agent",
      content: "Priority: 3 Champions are showing churn signals. I've drafted personalized win-back offers for each.",
      actions: [
        { label: "Preview & Approve All", variant: "primary" },
        { label: "Review Each", variant: "secondary" },
        { label: "Dismiss", variant: "ghost" },
      ],
      timestamp: "8:02 AM",
    },
    {
      id: "4",
      role: "user",
      content: "Show me who's about to churn",
      timestamp: "8:15 AM",
    },
    {
      id: "5",
      role: "agent",
      content: "Here are your 3 highest-risk customers. Each has moved from Champion/Loyal to At Risk in the last 2 weeks:",
      toolCalls: ["query_segments", "get_churn_risk"],
      timestamp: "8:15 AM",
    },
    {
      id: "6",
      role: "agent",
      content: "",
      cards: [
        { type: "customer", data: { name: "Sarah K.", risk: 94, ltv: "$2,400", days: "67d", from: "Champion", to: "At Risk" } },
        { type: "customer", data: { name: "Mike R.", risk: 87, ltv: "$1,800", days: "52d", from: "Loyal", to: "At Risk" } },
        { type: "customer", data: { name: "Lisa M.", risk: 82, ltv: "$3,200", days: "48d", from: "Champion", to: "At Risk" } },
      ],
      actions: [
        { label: "Send Offers to All 3", variant: "primary" },
        { label: "Create Segment", variant: "secondary" },
      ],
      timestamp: "8:15 AM",
    },
    {
      id: "7",
      role: "user",
      content: "Send Sarah a 20% off win-back on WhatsApp",
      timestamp: "8:18 AM",
    },
    {
      id: "8",
      role: "agent",
      content: "Done. I created a 20% discount code (WINBACK-SARAH-20) valid for 7 days and sent it to Sarah K. via WhatsApp. She'll get a personalized message referencing her last purchase (Merino Wool Sweater).",
      toolCalls: ["create_discount_code", "send_whatsapp"],
      actions: [
        { label: "View Discount", variant: "secondary" },
        { label: "Send to Mike & Lisa Too", variant: "primary" },
      ],
      timestamp: "8:18 AM",
    },
  ];

  const iconMap: Record<string, typeof DollarSign> = { dollar: DollarSign, users: Users, alert: ShieldAlert, zap: Zap };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } };

  return (
    <div className="min-h-screen flex" style={{ background: "#faf8f5", fontFamily: "'Inter', sans-serif", color: "#2c2418" }}>
      {/* Left sidebar (mini) */}
      <div className="w-16 border-r border-black/5 flex flex-col items-center py-4 gap-1 flex-shrink-0" style={{ background: "rgba(237,231,219,0.5)" }}>
        <a href="/design-concepts" className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-black/5 transition-colors mb-4" title="Back">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </a>
        {[
          { icon: Sparkles, active: true, label: "Agent" },
          { icon: Users, active: false, label: "Customers" },
          { icon: Mail, active: false, label: "Campaigns" },
          { icon: Zap, active: false, label: "Automations" },
          { icon: TrendingUp, active: false, label: "Analytics" },
        ].map((item, i) => (
          <button key={i} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${item.active ? "bg-[#2c2418] text-[#faf8f5]" : "text-gray-400 hover:bg-black/5 hover:text-gray-600"}`} title={item.label}>
            <item.icon className="w-4 h-4" />
          </button>
        ))}
        <div className="flex-1" />
        <button className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-black/5 transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#c4704a]" />
        </button>
      </div>

      {/* Main conversation area */}
      <div className="flex-1 flex flex-col max-w-[800px] mx-auto">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-6 h-14 border-b border-black/5 flex-shrink-0" style={{ background: "rgba(250,248,245,0.8)", backdropFilter: "blur(12px)" }}>
          <Sparkles className="w-4 h-4 text-[#c4704a]" />
          <span className="text-[13px] font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Allo Agent</span>
          <div className="flex items-center gap-1.5 ml-2">
            <PulseDot color="bg-[#6B7A2F]" />
            <span className="text-[10px] font-mono text-[#6B7A2F]/60">Active</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/8 border border-amber-500/15">
            <DollarSign className="w-3 h-3 text-amber-600" />
            <span className="text-[11px] font-mono font-bold text-amber-700 tabular-nums">$12,340</span>
            <span className="text-[9px] font-mono text-amber-600/40">saved</span>
          </div>
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/3 hover:bg-black/5 transition-colors">
            <Search className="w-3 h-3 text-gray-400" />
            <kbd className="text-[9px] font-mono text-gray-300"><Command className="w-2.5 h-2.5 inline" />K</kbd>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <motion.div className="px-6 py-6 space-y-5" variants={stagger} initial="hidden" animate="visible">
            {messages.map((msg) => (
              <motion.div key={msg.id} variants={fadeUp} className={msg.role === "user" ? "flex justify-end" : ""}>
                {msg.role === "user" ? (
                  <div className="max-w-[70%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-[#2c2418] text-[#faf8f5] text-[14px] leading-relaxed">
                    {msg.content}
                    <div className="text-[10px] font-mono text-white/25 mt-1">{msg.timestamp}</div>
                  </div>
                ) : (
                  <div className="max-w-[90%] space-y-3">
                    {/* Tool calls indicator */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.toolCalls.map((tool) => (
                          <span key={tool} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6B7A2F]/8 border border-[#6B7A2F]/15 text-[10px] font-mono text-[#6B7A2F]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#6B7A2F]" />
                            {tool.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Text content */}
                    {msg.content && (
                      <div className="text-[14px] leading-relaxed text-[#2c2418]/80">
                        {msg.content}
                      </div>
                    )}

                    {/* Inline cards */}
                    {msg.cards && (
                      <div className={`flex gap-2 flex-wrap ${msg.cards[0]?.type === "customer" ? "flex-col" : ""}`}>
                        {msg.cards.map((card, ci) => {
                          if (card.type === "kpi") {
                            const d = card.data as { label: string; value: string; change: string; up: boolean; icon: string };
                            return <KpiCard key={ci} label={d.label} value={d.value} change={d.change} up={d.up} icon={iconMap[d.icon] || Zap} />;
                          }
                          if (card.type === "customer") {
                            const d = card.data as { name: string; risk: number; ltv: string; days: string; from: string; to: string };
                            return <CustomerCard key={ci} {...d} />;
                          }
                          return null;
                        })}
                      </div>
                    )}

                    {/* Action buttons */}
                    {msg.actions && (
                      <div className="flex gap-2 flex-wrap">
                        {msg.actions.map((action, ai) => (
                          <button
                            key={ai}
                            className={`text-[12px] font-mono font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
                              action.variant === "primary"
                                ? "bg-[#2c2418] text-[#faf8f5] hover:bg-[#2c2418]/90"
                                : action.variant === "secondary"
                                ? "bg-black/4 hover:bg-black/6 text-[#2c2418]"
                                : "text-gray-400 hover:text-gray-600"
                            }`}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Timestamp */}
                    {!msg.cards?.length && (
                      <div className="text-[10px] font-mono text-gray-300">{msg.timestamp}</div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </motion.div>
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-black/5" style={{ background: "rgba(250,248,245,0.8)", backdropFilter: "blur(12px)" }}>
          {/* Suggestion chips */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {["Create a win-back campaign", "Show churn trends", "Draft a welcome series", "Revenue report"].map((s) => (
              <button key={s} className="flex-shrink-0 text-[11px] font-mono px-3 py-1.5 rounded-full border border-black/5 hover:border-[#c4704a]/30 hover:bg-[#c4704a]/3 transition-colors text-gray-500 hover:text-[#2c2418]">
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the agent anything..."
              className="flex-1 text-[14px] px-4 py-2.5 rounded-xl border border-black/5 bg-white outline-none focus:border-[#c4704a]/30 transition-colors"
            />
            <button className="p-2.5 rounded-xl bg-[#2c2418] text-[#faf8f5] hover:bg-[#2c2418]/90 transition-colors disabled:opacity-30" disabled={!input.trim()}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Live activity sidebar */}
      <div className="w-72 border-l border-black/5 flex-shrink-0 overflow-y-auto" style={{ background: "rgba(237,231,219,0.3)" }}>
        <div className="px-4 py-3 border-b border-black/5">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-[#c4704a]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.1em] font-bold text-gray-400">Live Activity</span>
          </div>
        </div>

        {/* Recent actions */}
        <div className="p-3 space-y-1">
          {[
            { action: "Win-back sent", target: "Sarah K.", ch: "whatsapp", time: "3m", icon: Phone, color: "text-green-500" },
            { action: "Segment created", target: "Holiday Shoppers", ch: null, time: "12m", icon: Users, color: "text-gray-500" },
            { action: "Analyzing...", target: "Winter Sale", ch: "email", time: "now", icon: Mail, color: "text-purple-500" },
            { action: "Resolved", target: "Alex T.", ch: "sms", time: "28m", icon: MessageSquare, color: "text-blue-500" },
            { action: "Draft ready", target: "Re-engagement", ch: "email", time: "1h", icon: Mail, color: "text-purple-500" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/50 transition-colors cursor-pointer">
              <item.icon className={`w-3.5 h-3.5 ${item.color} mt-0.5 flex-shrink-0`} />
              <div className="min-w-0">
                <div className="text-[11px] font-medium truncate">{item.action}</div>
                <div className="text-[10px] text-gray-400 truncate">{item.target} · {item.time}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-b border-black/5">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-[#c4704a]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.1em] font-bold text-gray-400">Conversations</span>
            <span className="ml-auto text-[10px] font-mono text-red-500 font-bold">2</span>
          </div>
        </div>

        <div className="p-3 space-y-1">
          {[
            { name: "Sarah K.", ch: Phone, color: "text-green-500", msg: "Order tracking", time: "2m", esc: false },
            { name: "Alex T.", ch: MessageSquare, color: "text-blue-500", msg: "Return request", time: "8m", esc: true },
            { name: "Jordan P.", ch: Mail, color: "text-purple-500", msg: "Product question", time: "15m", esc: false },
          ].map((c, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/50 transition-colors cursor-pointer">
              <c.ch className={`w-3.5 h-3.5 ${c.color} flex-shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium truncate">{c.name}</div>
                <div className="text-[10px] text-gray-400 truncate">{c.msg}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {c.esc && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                <span className="text-[9px] font-mono text-gray-300">{c.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Observations */}
        <div className="px-4 py-3 border-t border-black/5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-mono uppercase tracking-[0.1em] font-bold text-gray-400">Alerts</span>
          </div>
        </div>
        <div className="p-3 space-y-2">
          <div className="rounded-lg border border-amber-500/20 p-2.5" style={{ background: "rgba(245,158,11,0.03)" }}>
            <div className="text-[11px] font-medium">Revenue dip detected</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Daily revenue 23% below 30-day avg</div>
            <button className="text-[10px] font-mono text-[#c4704a] mt-1.5 hover:underline">Investigate</button>
          </div>
        </div>
      </div>
    </div>
  );
}
