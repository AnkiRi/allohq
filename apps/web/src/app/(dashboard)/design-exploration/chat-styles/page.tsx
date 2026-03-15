"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, Send, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Chat style definitions
// ---------------------------------------------------------------------------

type ChatStyleDef = {
  name: string;
  tag: string;
  pros: string;
  cons: string;
};

const CHAT_STYLES: ChatStyleDef[] = [
  {
    name: "Chat A: Bubble Style (Current)",
    tag: "Standard chat bubbles — left for AI, right for user. WhatsApp/iMessage pattern.",
    pros: "Familiar, conversational. Clear distinction between AI and user. Easy to scan.",
    cons: "Chat-app feel may not suit a business tool. Bubbles waste horizontal space.",
  },
  {
    name: "Chat B: Thread Style",
    tag: "No bubbles. Subtle left/right borders. Document-like conversation flow.",
    pros: "Professional, feels like a work conversation. More space for content. Less playful.",
    cons: "Less visual separation between messages. Can feel monotonous in long threads.",
  },
  {
    name: "Chat C: Card Response Style",
    tag: "AI responses as structured cards with inline data and actions.",
    pros: "Rich, actionable. AI feels like an intelligent dashboard. Great for data-heavy responses.",
    cons: "Complex to build. May feel impersonal. Harder to have natural conversation.",
  },
];

// ---------------------------------------------------------------------------
// Full chat previews
// ---------------------------------------------------------------------------

function BubbleChatPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-white/50 min-h-[600px] flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#EDE7DB] flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#6B7A2F]" />
        <span className="text-sm font-bold text-[#2C2C2C] font-mono">Allo AI</span>
        <span className="text-[10px] text-[#8B8074] font-mono">All systems running</span>
      </div>

      {/* Messages */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        {/* AI greeting */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C4704D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={14} className="text-[#C4704D]" />
          </div>
          <div className="bg-[#FAF6F1] rounded-2xl rounded-tl-md px-4 py-3 max-w-[75%] text-sm text-[#2C2C2C] leading-relaxed">
            Good morning! Here&apos;s what happened overnight: Revenue is up 8% with Rs 12,400 from 8 orders. However, 51 customers are now hibernating — I recommend a win-back campaign.
          </div>
        </div>

        {/* User */}
        <div className="flex justify-end">
          <div className="bg-[#2C2C2C] text-white rounded-2xl rounded-tr-md px-4 py-3 max-w-[65%] text-sm">
            Create a win-back campaign for the hibernating segment
          </div>
        </div>

        {/* AI with data */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C4704D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={14} className="text-[#C4704D]" />
          </div>
          <div className="bg-[#FAF6F1] rounded-2xl rounded-tl-md px-4 py-3 max-w-[75%] text-sm text-[#2C2C2C] leading-relaxed">
            <p>I&apos;ll create a 3-email win-back sequence targeting 51 customers:</p>
            <ul className="mt-2 space-y-1 text-xs text-[#5C5549]">
              <li>Email 1: &quot;We miss you&quot; — 20% discount offer</li>
              <li>Email 2: New product highlights — sent 3 days later</li>
              <li>Email 3: Last chance reminder — sent 5 days later</li>
            </ul>
            <p className="mt-2 text-xs text-[#8B8074]">Estimated recovery: Rs 12,000-16,000</p>
          </div>
        </div>

        {/* User */}
        <div className="flex justify-end">
          <div className="bg-[#2C2C2C] text-white rounded-2xl rounded-tr-md px-4 py-3 max-w-[65%] text-sm">
            Looks good! Approve and launch it
          </div>
        </div>

        {/* AI confirmation */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C4704D]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles size={14} className="text-[#C4704D]" />
          </div>
          <div className="bg-[#FAF6F1] rounded-2xl rounded-tl-md px-4 py-3 max-w-[75%] text-sm text-[#2C2C2C] leading-relaxed">
            Win-back campaign launched! First emails going out now. I&apos;ll report back on open rates within 24 hours.
          </div>
        </div>

        {/* Activity notifications */}
        <div className="border-t border-[#EDE7DB]/50 pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Check size={14} className="text-[#6B7A2F]" />
            <span className="text-xs text-[#8B8074] font-mono">Win-back campaign launched — 51 recipients</span>
            <span className="text-[10px] text-[#8B8074]/60 ml-auto">Just now</span>
          </div>
          <div className="flex items-center gap-2">
            <Check size={14} className="text-[#6B7A2F]" />
            <span className="text-xs text-[#8B8074] font-mono">Welcome Series — 42% open rate</span>
            <span className="text-[10px] text-[#8B8074]/60 ml-auto">2h ago</span>
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-full bg-[#C4704D]/10 border border-[#C4704D]/20 text-xs text-[#C4704D] font-mono cursor-pointer">
            Show campaign stats
          </div>
          <div className="px-3 py-1.5 rounded-full bg-[#C4704D]/10 border border-[#C4704D]/20 text-xs text-[#C4704D] font-mono cursor-pointer">
            What else needs attention?
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-[#EDE7DB]">
        <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-[#EDE7DB]/50 border border-[#EDE7DB]">
          <span className="text-sm text-[#8B8074]/60 flex-1">Ask Allo anything...</span>
          <Send size={16} className="text-[#C4704D]" />
        </div>
      </div>
    </div>
  );
}

function ThreadChatPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-white/50 min-h-[600px] flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#EDE7DB] flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#6B7A2F]" />
        <span className="text-sm font-bold text-[#2C2C2C] font-mono">Allo AI</span>
        <span className="text-[10px] text-[#8B8074] font-mono">All systems running</span>
      </div>

      {/* Messages */}
      <div className="flex-1 p-5 space-y-5 overflow-y-auto">
        {/* AI message */}
        <div className="border-l-2 border-[#C4704D]/30 pl-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={12} className="text-[#C4704D]" />
            <span className="text-[10px] font-mono text-[#C4704D] font-medium">ALLO AI</span>
            <span className="text-[10px] text-[#8B8074]/60">9:00 AM</span>
          </div>
          <div className="text-sm text-[#2C2C2C] leading-relaxed">
            Good morning! Here&apos;s what happened overnight: Revenue is up 8% with Rs 12,400 from 8 orders. However, 51 customers are now hibernating — I recommend a win-back campaign.
          </div>
        </div>

        {/* User message */}
        <div className="border-r-2 border-[#2C2C2C]/20 pr-4 text-right">
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="text-[10px] text-[#8B8074]/60">9:02 AM</span>
            <span className="text-[10px] font-mono text-[#2C2C2C] font-medium">YOU</span>
          </div>
          <div className="text-sm text-[#2C2C2C]">
            Create a win-back campaign for the hibernating segment
          </div>
        </div>

        {/* AI response */}
        <div className="border-l-2 border-[#C4704D]/30 pl-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={12} className="text-[#C4704D]" />
            <span className="text-[10px] font-mono text-[#C4704D] font-medium">ALLO AI</span>
            <span className="text-[10px] text-[#8B8074]/60">9:02 AM</span>
          </div>
          <div className="text-sm text-[#2C2C2C] leading-relaxed">
            I&apos;ll create a 3-email win-back sequence targeting 51 customers:
          </div>
          <div className="mt-2 text-xs text-[#5C5549] leading-relaxed space-y-1">
            <div>1. &quot;We miss you&quot; — 20% discount offer</div>
            <div>2. New product highlights — sent 3 days later</div>
            <div>3. Last chance reminder — sent 5 days later</div>
          </div>
          <div className="mt-2 text-xs text-[#8B8074]">Estimated recovery: Rs 12,000-16,000</div>
        </div>

        {/* User */}
        <div className="border-r-2 border-[#2C2C2C]/20 pr-4 text-right">
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="text-[10px] text-[#8B8074]/60">9:03 AM</span>
            <span className="text-[10px] font-mono text-[#2C2C2C] font-medium">YOU</span>
          </div>
          <div className="text-sm text-[#2C2C2C]">Looks good! Approve and launch it</div>
        </div>

        {/* AI confirmation */}
        <div className="border-l-2 border-[#6B7A2F]/30 pl-4">
          <div className="flex items-center gap-2 mb-1">
            <Check size={12} className="text-[#6B7A2F]" />
            <span className="text-[10px] font-mono text-[#6B7A2F] font-medium">ALLO AI — ACTION COMPLETED</span>
            <span className="text-[10px] text-[#8B8074]/60">9:03 AM</span>
          </div>
          <div className="text-sm text-[#2C2C2C] leading-relaxed">
            Win-back campaign launched! First emails going out now. I&apos;ll report back on open rates within 24 hours.
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex gap-2 flex-wrap pt-2">
          <div className="px-3 py-1.5 rounded-lg bg-[#FAF6F1] border border-[#EDE7DB] text-xs text-[#5C5549] font-mono cursor-pointer hover:bg-[#C4704D]/10 hover:text-[#C4704D] transition-colors">
            Show campaign stats
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#FAF6F1] border border-[#EDE7DB] text-xs text-[#5C5549] font-mono cursor-pointer hover:bg-[#C4704D]/10 hover:text-[#C4704D] transition-colors">
            What else needs attention?
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-[#EDE7DB]">
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#FAF6F1] border border-[#EDE7DB]">
          <span className="text-sm text-[#8B8074]/60 flex-1">Type a message...</span>
          <Send size={16} className="text-[#C4704D]" />
        </div>
      </div>
    </div>
  );
}

function CardChatPreview() {
  return (
    <div className="rounded-2xl overflow-hidden border border-[#EDE7DB] bg-white/50 min-h-[600px] flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#EDE7DB] flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[#6B7A2F]" />
        <span className="text-sm font-bold text-[#2C2C2C] font-mono">Allo AI</span>
        <span className="text-[10px] text-[#8B8074] font-mono">All systems running</span>
      </div>

      {/* Messages */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        {/* Briefing card */}
        <div className="rounded-xl border border-[#EDE7DB] overflow-hidden">
          <div className="px-4 py-2 bg-[#C4704D]/5 border-b border-[#EDE7DB] flex items-center gap-2">
            <Sparkles size={12} className="text-[#C4704D]" />
            <span className="text-[10px] font-mono text-[#C4704D] uppercase">Morning Briefing</span>
            <span className="text-[10px] text-[#8B8074]/60 ml-auto">9:00 AM</span>
          </div>
          <div className="p-4">
            <div className="text-sm text-[#2C2C2C] leading-relaxed mb-3">
              Revenue is up 8% with Rs 12,400 from 8 orders. 51 customers are now hibernating.
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#FAF6F1] rounded-lg p-3 text-center">
                <div className="text-[9px] text-[#8B8074] font-mono uppercase">Revenue</div>
                <div className="text-lg font-bold text-[#6B7A2F] font-mono">Rs 42.8K</div>
                <div className="text-[10px] text-[#6B7A2F]">+8%</div>
              </div>
              <div className="bg-[#FAF6F1] rounded-lg p-3 text-center">
                <div className="text-[9px] text-[#8B8074] font-mono uppercase">Orders</div>
                <div className="text-lg font-bold text-[#2C2C2C] font-mono">8</div>
                <div className="text-[10px] text-[#8B8074]">today</div>
              </div>
              <div className="bg-[#FAF6F1] rounded-lg p-3 text-center">
                <div className="text-[9px] text-[#8B8074] font-mono uppercase">At Risk</div>
                <div className="text-lg font-bold text-[#C44A4A] font-mono">51</div>
                <div className="text-[10px] text-[#C44A4A]">hibernating</div>
              </div>
            </div>
          </div>
        </div>

        {/* User message (simple text) */}
        <div className="text-right text-sm text-[#5C5549] py-2">
          Create a win-back campaign for the hibernating segment
        </div>

        {/* Campaign card response */}
        <div className="rounded-xl border border-[#EDE7DB] overflow-hidden">
          <div className="px-4 py-2 bg-[#6B7A2F]/5 border-b border-[#EDE7DB] flex items-center gap-2">
            <Sparkles size={12} className="text-[#6B7A2F]" />
            <span className="text-[10px] font-mono text-[#6B7A2F] uppercase">Campaign Created</span>
            <span className="text-[10px] text-[#8B8074]/60 ml-auto">9:02 AM</span>
          </div>
          <div className="p-4">
            <div className="text-base font-bold text-[#2C2C2C] mb-1">Win-Back: Hibernating Customers</div>
            <div className="text-xs text-[#8B8074] mb-3">3-email sequence, 51 recipients, 7-day cadence</div>
            <div className="space-y-2 mb-3">
              {[
                { n: 1, subject: "We miss you", desc: "20% discount offer" },
                { n: 2, subject: "New arrivals", desc: "Product highlights, day 3" },
                { n: 3, subject: "Last chance", desc: "Final reminder, day 5" },
              ].map((email) => (
                <div key={email.n} className="flex items-center gap-3 p-2 rounded-lg bg-[#FAF6F1]">
                  <div className="w-6 h-6 rounded-full bg-[#C4704D]/10 flex items-center justify-center text-[10px] font-mono text-[#C4704D]">
                    {email.n}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[#2C2C2C]">{email.subject}</div>
                    <div className="text-[10px] text-[#8B8074]">{email.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-[#C4704D] text-white text-xs font-mono rounded-lg">
                Approve & Launch
              </button>
              <button className="px-4 py-2 border border-[#EDE7DB] text-xs font-mono rounded-lg text-[#5C5549]">
                Edit Emails
              </button>
              <button className="px-4 py-2 border border-[#EDE7DB] text-xs font-mono rounded-lg text-[#5C5549]">
                Preview
              </button>
            </div>
          </div>
        </div>

        {/* Status card */}
        <div className="rounded-xl border border-[#6B7A2F]/20 bg-[#6B7A2F]/5 p-4">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-[#6B7A2F]" />
            <span className="text-sm font-medium text-[#6B7A2F]">Campaign launched successfully</span>
          </div>
          <div className="text-xs text-[#8B8074] mt-1">51 emails queued. First batch sending now. Open rate report in 24h.</div>
        </div>

        {/* Suggestions */}
        <div className="flex gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-lg bg-[#FAF6F1] border border-[#EDE7DB] text-xs text-[#5C5549] font-mono cursor-pointer hover:bg-[#C4704D]/10 hover:text-[#C4704D] transition-colors">
            Show campaign stats
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#FAF6F1] border border-[#EDE7DB] text-xs text-[#5C5549] font-mono cursor-pointer hover:bg-[#C4704D]/10 hover:text-[#C4704D] transition-colors">
            Create another campaign
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-[#EDE7DB]">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FAF6F1] border border-[#EDE7DB]">
          <span className="text-sm text-[#8B8074]/60 flex-1">Ask Allo anything...</span>
          <Send size={16} className="text-[#C4704D]" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ChatStylesPage() {
  const [active, setActive] = useState(0);
  const style = CHAT_STYLES[active]!;

  const previews = [BubbleChatPreview, ThreadChatPreview, CardChatPreview];
  const ActivePreview = previews[active]!;

  return (
    <div className="max-w-3xl mx-auto py-8">
      <Link
        href="/design-exploration"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 font-mono"
      >
        <ArrowLeft size={14} />
        Back to Design Exploration
      </Link>

      <h1 className="text-2xl font-bold font-mono mb-1">Chat Styles</h1>
      <p className="text-sm text-muted-foreground mb-8">
        3 conversation rendering styles for the AI panel. Click each tab to compare.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {CHAT_STYLES.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setActive(i)}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-all ${
              active === i
                ? "bg-[#2C2C2C] text-white shadow-lg"
                : "bg-white border border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
        <div className="font-mono text-xs uppercase tracking-wider mb-1 text-amber-700">{style.name}</div>
        <div className="text-xs text-amber-800 mb-2">{style.tag}</div>
        <strong>Pros:</strong> {style.pros}<br />
        <strong>Cons:</strong> {style.cons}
      </div>

      <ActivePreview />
    </div>
  );
}
