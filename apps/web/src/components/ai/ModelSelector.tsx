"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Cpu } from "lucide-react";
import { trpc } from "@/lib/trpc";

type AIModelId = "claude-sonnet-4-5-20250929" | "gpt-4o" | "gpt-4o-mini";

interface ModelSelectorProps {
  value: AIModelId | undefined;
  onChange: (model: AIModelId) => void;
  compact?: boolean;
}

const MODEL_LABELS: Record<AIModelId, { label: string; short: string; provider: string }> = {
  "claude-sonnet-4-5-20250929": { label: "Claude Sonnet 4.5", short: "Claude 4.5", provider: "Anthropic" },
  "gpt-4o": { label: "GPT-4o", short: "GPT-4o", provider: "OpenAI" },
  "gpt-4o-mini": { label: "GPT-4o Mini", short: "GPT-4o Mini", provider: "OpenAI" },
};

const TIER_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  premium: { bg: "bg-purple-50", text: "text-purple-600", label: "Premium" },
  standard: { bg: "bg-blue-50", text: "text-blue-600", label: "Standard" },
  economy: { bg: "bg-green-50", text: "text-green-600", label: "Economy" },
};

export function ModelSelector({ value, onChange, compact }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: models } = trpc.ai.models.useQuery();

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = value ? MODEL_LABELS[value] : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-700 hover:border-gray-400 transition-all bg-white"
      >
        <Cpu className="w-3 h-3 text-gray-400" />
        {compact
          ? (selected?.short ?? "Select model")
          : (selected?.label ?? "Select model")}
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">AI Model</p>
          </div>
          {models?.map((model) => {
            const info = MODEL_LABELS[model.id as AIModelId];
            if (!info) return null;
            const isSelected = value === model.id;
            const isAvailable = model.available;

            return (
              <button
                key={model.id}
                onClick={() => {
                  if (isAvailable) {
                    onChange(model.id as AIModelId);
                    setOpen(false);
                  }
                }}
                disabled={!isAvailable}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  isSelected
                    ? "bg-gray-50"
                    : isAvailable
                      ? "hover:bg-gray-50"
                      : "opacity-40 cursor-not-allowed"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-gray-900">{info.label}</span>
                    <span className="text-[10px] font-mono text-gray-400">{info.provider}</span>
                    {(model as any).tier && (() => {
                      const tier = TIER_BADGE[(model as any).tier];
                      return tier ? (
                        <span className={`px-1 py-0.5 rounded text-[8px] font-mono font-bold ${tier.bg} ${tier.text}`}>
                          {tier.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <p className="text-[10px] font-mono text-gray-400 mt-0.5">
                    {model.description}
                    {!isAvailable && " — API key not configured"}
                  </p>
                  {(model as any).inputCostPerMillion != null && (
                    <p className="text-[9px] font-mono text-gray-300 mt-0.5">
                      ~${(model as any).inputCostPerMillion}/M in, ~${(model as any).outputCostPerMillion}/M out
                    </p>
                  )}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-gray-900 flex-shrink-0" />}
              </button>
            );
          }) ?? (
            <div className="px-3 py-4 text-xs font-mono text-gray-400 text-center">Loading models...</div>
          )}
        </div>
      )}
    </div>
  );
}

export type { AIModelId };
