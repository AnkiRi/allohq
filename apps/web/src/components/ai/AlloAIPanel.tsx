"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Send,
} from "lucide-react";
import { cn } from "@allohq/ui";

type PanelState = "open" | "collapsed" | "expanded";

interface InsightCard {
  label: string;
  value: string;
  description?: string;
  variant: "accent" | "success";
  stats?: { label: string; value: string }[];
}

interface AIMessage {
  id: string;
  role: "assistant";
  content: string;
  insightCard?: InsightCard;
  timestamp: string;
}

const INITIAL_MESSAGES: AIMessage[] = [
  {
    id: "welcome-1",
    role: "assistant",
    content: "Welcome back! Here's what's happening with your store today:",
    insightCard: {
      label: "Today's Highlight",
      value: "12 customers moved to \"At Risk\" segment",
      description:
        "These customers haven't purchased in 45+ days. I can create a win-back automation for them.",
      variant: "accent",
    },
    timestamp: "Just now",
  },
  {
    id: "welcome-2",
    role: "assistant",
    content:
      "Your \"Welcome Series\" automation drove $1,240 in conversions this week — up 18% from last week.",
    insightCard: {
      label: "Performance",
      value: "",
      variant: "success",
      stats: [
        { label: "Revenue", value: "$1,240" },
        { label: "vs last week", value: "+18%" },
        { label: "Open rate", value: "67%" },
      ],
    },
    timestamp: "2 min ago",
  },
];

const SUGGESTION_PILLS = [
  "Create win-back flow",
  "Show at-risk customers",
  "Send VIP campaign",
  "Analyze last 30 days",
];

function InsightCardView({ card }: { card: InsightCard }) {
  const isAccent = card.variant === "accent";
  return (
    <div
      className={cn(
        "rounded-xl p-3.5 border mt-2.5 mb-1",
        isAccent
          ? "bg-[hsl(var(--accent-bg))] border-border"
          : "bg-[hsl(var(--success-bg))] border-[hsl(var(--success)/0.2)]"
      )}
    >
      <div
        className={cn(
          "font-mono text-[10px] uppercase tracking-wider mb-1.5",
          isAccent ? "text-[hsl(var(--accent))]" : "text-[hsl(var(--success))]"
        )}
      >
        {card.label}
      </div>
      {card.value && (
        <div className="font-mono text-[14px] font-semibold text-foreground">
          {card.value}
        </div>
      )}
      {card.description && (
        <div className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed font-sans">
          {card.description}
        </div>
      )}
      {card.stats && (
        <div className="flex gap-5 mt-2">
          {card.stats.map((stat) => (
            <div key={stat.label}>
              <div
                className={cn(
                  "font-mono text-lg font-bold",
                  isAccent
                    ? "text-[hsl(var(--accent))]"
                    : "text-[hsl(var(--success))]"
                )}
              >
                {stat.value}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIMessageBubble({ message }: { message: AIMessage }) {
  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-lg bg-[hsl(var(--accent-bg))] flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3 h-3 text-[hsl(var(--accent))]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] leading-[1.65] text-foreground font-sans">
          {message.content}
        </div>
        {message.insightCard && (
          <InsightCardView card={message.insightCard} />
        )}
        <div className="font-mono text-[10px] text-muted-foreground/50 mt-1">
          {message.timestamp}
        </div>
      </div>
    </div>
  );
}

export function AlloAIPanel() {
  const [panelState, setPanelState] = useState<PanelState>("open");
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const toggle = () => {
    if (panelState === "collapsed") {
      setPanelState("open");
    } else {
      setPanelState("collapsed");
    }
  };

  const toggleExpand = () => {
    if (panelState === "expanded") {
      setPanelState("open");
    } else {
      setPanelState("expanded");
    }
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    // TODO: Wire to AI backend
    setInput("");
  };

  return (
    <>
      {/* Main panel */}
      <aside
        className={cn(
          "flex flex-col border-l transition-all duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] relative",
          panelState === "open" &&
            "w-[380px] flex-shrink-0 bg-[hsl(var(--ai-panel-bg))] border-border",
          panelState === "collapsed" &&
            "w-0 border-l-0 overflow-hidden",
          panelState === "expanded" &&
            "fixed top-14 right-0 bottom-0 w-[60%] z-50 bg-[hsl(var(--ai-panel-bg))] border-border shadow-[-20px_0_60px_rgba(0,0,0,0.08)]"
        )}
      >
        {/* Toggle button */}
        <button
          onClick={toggle}
          className="absolute top-3 -left-10 w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
          title={panelState === "collapsed" ? "Open AI Panel" : "Close AI Panel"}
        >
          {panelState === "collapsed" ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {/* Expand button */}
        <button
          onClick={toggleExpand}
          className="absolute top-3 right-3 w-7 h-7 rounded-md bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
          title={
            panelState === "expanded" ? "Collapse panel" : "Expand to full view"
          }
        >
          {panelState === "expanded" ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <div>
            <div className="text-[13px] font-mono font-bold text-foreground">
              Allo AI
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              Your retention co-pilot
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {INITIAL_MESSAGES.map((msg) => (
            <AIMessageBubble key={msg.id} message={msg} />
          ))}

          {/* Suggestion pills */}
          <div className="pl-[34px]">
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Suggested actions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTION_PILLS.map((pill) => (
                <button
                  key={pill}
                  className="px-3 py-1.5 rounded-full bg-[hsl(var(--accent-bg))] border border-border text-[hsl(var(--accent))] font-mono text-[11px] hover:border-primary/50 transition-colors"
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="px-5 py-4 border-t border-border">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="Ask Allo anything about your store..."
              className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-muted border border-border text-[13px] font-sans text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            <button
              onClick={handleSubmit}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-primary hover:bg-[hsl(var(--accent-bg))] transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Floating button when collapsed */}
      {panelState === "collapsed" && (
        <button
          onClick={() => setPanelState("open")}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-[14px] bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-[60]"
          title="Open Allo AI"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
