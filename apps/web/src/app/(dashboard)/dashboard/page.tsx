"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Users,
  Layers,
  Brain,
  Zap,
  ShoppingBag,
  Store,
  RefreshCw,
  Palette,
  Sparkles,
  Check,
  Package,
  ShoppingCart,
  Loader2,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  Bot,
  Circle,
  Cpu,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { trpc } from "@/lib/trpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetupStep {
  key: string;
  label: string;
  description: string;
  href?: string;
  ctaLabel: string;
  icon: typeof Store;
  done: boolean;
  onAction?: () => void;
  loading?: boolean;
  loadingLabel?: string;
}

type BrandProfile = {
  brandName: string;
  brandDescription: string | null;
  toneAttributes: Record<string, string>;
  vocabulary: Record<string, string[]>;
  visualStyle: Record<string, string | string[]>;
  sampleCopy: string[];
  analyzedAt: string;
} | null;

type Program = {
  id: string;
  name: string;
  description: string | null;
  programType: string;
  status: string;
};

type AgentPipelineRun = {
  id: string;
  status: string;
  phase: string;
  progress: Record<string, unknown>;
  programsCount: number;
  programsDone: number;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

// ---------------------------------------------------------------------------
// Sparkline — inline SVG polyline
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  color = "var(--olive)",
  width = 80,
  height = 20,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="inline-block">
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
// AnimatedNumber — framer-motion count-up
// ---------------------------------------------------------------------------

function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => {
    const formatted = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
    return `${prefix}${formatted}${suffix}`;
  });

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 1.2,
      ease: "easeOut",
    });
    return controls.stop;
  }, [value, motionVal]);

  return <motion.span>{display}</motion.span>;
}

// ---------------------------------------------------------------------------
// Placeholder sparkline data
// ---------------------------------------------------------------------------

const SPARK_CUSTOMERS = [12, 15, 14, 18, 22, 25, 23, 28, 30, 32, 35, 38];
const SPARK_CAMPAIGNS = [0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5];
const SPARK_REVENUE = [120, 340, 280, 510, 420, 680, 720, 890, 950, 1100, 1050, 1200];

// ---------------------------------------------------------------------------
// Agent Pipeline phases
// ---------------------------------------------------------------------------

const AGENT_PHASES = [
  { key: "recommend", label: "Recommend Programs" },
  { key: "generate_email", label: "Generate Emails" },
  { key: "generate_sms", label: "Generate SMS" },
  { key: "generate_whatsapp", label: "Generate WhatsApp" },
  { key: "generate_rcs", label: "Generate RCS" },
  { key: "create_workflow", label: "Create Workflows" },
  { key: "done", label: "Ready for Review" },
] as const;

function getPhaseIndex(phase: string): number {
  return AGENT_PHASES.findIndex((p) => p.key === phase);
}

// ---------------------------------------------------------------------------
// Inline Model Picker (for setup checklist)
// ---------------------------------------------------------------------------

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  premium: { bg: "bg-purple-50", text: "text-purple-700", label: "Premium" },
  standard: { bg: "bg-blue-50", text: "text-blue-700", label: "Standard" },
  economy: { bg: "bg-green-50", text: "text-green-700", label: "Economy" },
};

function InlineModelPicker({
  models,
  selectedModel,
  onSelect,
  isPending,
}: {
  models: { id: string; label: string; provider: string; description: string; available: boolean; tier: string; inputCostPerMillion: number; outputCostPerMillion: number }[];
  selectedModel: string | null;
  onSelect: (model: string) => void;
  isPending: boolean;
}) {
  return (
    <div className="ml-11 mt-2 mb-1">
      <div className="glass-card-static p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-mono text-muted-foreground">
            Choose which AI model to use for all content generation:
          </p>
          {selectedModel && (
            <p className="text-[9px] font-mono text-muted-foreground/50">
              You can change this until you start brand analysis
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {models.map((model) => {
            const isSelected = selectedModel === model.id;
            const tier = TIER_STYLES[model.tier] ?? TIER_STYLES["standard"]!;
            return (
              <button
                key={model.id}
                onClick={() => onSelect(model.id)}
                disabled={isPending || !model.available}
                className={`relative text-left p-3 border rounded-lg transition-all ${
                  isSelected
                    ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] bg-white/40"
                    : model.available
                      ? "border-white/20 hover:border-terracotta/50 bg-white/20"
                      : "border-white/10 opacity-40 cursor-not-allowed bg-white/10"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-olive flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[11px] font-mono font-bold text-foreground">{model.label}</span>
                </div>
                <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-mono font-bold ${tier.bg} ${tier.text} mb-1`}>
                  {tier.label}
                </span>
                <p className="text-[9px] font-mono text-muted-foreground mb-1.5 line-clamp-2">{model.description}</p>
                <p className="text-[9px] font-mono text-muted-foreground/50">
                  ${model.inputCostPerMillion}/M in · ${model.outputCostPerMillion}/M out
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Creative Intensity Picker (for setup checklist)
// ---------------------------------------------------------------------------

const CREATIVE_OPTIONS = [
  { value: "text_heavy", label: "Text Heavy", desc: "Copy-focused, minimal visuals" },
  { value: "balanced", label: "Balanced", desc: "Mix of visuals and copy" },
  { value: "visual_heavy", label: "Visual Heavy", desc: "Maximum visual impact" },
] as const;

function InlineCreativeIntensityPicker({
  current,
  onSelect,
  isPending,
}: {
  current: string;
  onSelect: (value: string) => void;
  isPending: boolean;
}) {
  return (
    <div className="ml-11 mt-2 mb-1">
      <div className="glass-card-static p-4 space-y-3">
        <p className="text-[11px] font-mono text-muted-foreground">
          Choose the creative balance for AI-generated content:
        </p>
        <div className="grid grid-cols-3 gap-2">
          {CREATIVE_OPTIONS.map((opt) => {
            const isSelected = current === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onSelect(opt.value)}
                disabled={isPending}
                className={`relative text-left p-3 border rounded-lg transition-all ${
                  isSelected
                    ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] bg-white/40"
                    : "border-white/20 hover:border-terracotta/50 bg-white/20"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-olive flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                <p className="text-[11px] font-mono font-bold text-foreground">{opt.label}</p>
                <p className="text-[9px] font-mono text-muted-foreground mt-1">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selections Summary (shown when agent running or setup complete)
// ---------------------------------------------------------------------------

function SelectionsSummary({
  modelLabel,
  creativeIntensity,
}: {
  modelLabel: string;
  creativeIntensity: string;
}) {
  const creativeLabel = CREATIVE_OPTIONS.find((o) => o.value === creativeIntensity)?.label ?? "Balanced";

  return (
    <div className="glass-card-static px-6 py-4">
      <p className="section-header text-[10px] text-muted-foreground mb-3">
        YOUR AI CONFIGURATION
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/30 rounded-lg border border-white/20">
          <Cpu className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-mono text-foreground font-semibold">{modelLabel}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/30 rounded-lg border border-white/20">
          <SlidersHorizontal className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-mono text-foreground font-semibold">{creativeLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Progress Panel
// ---------------------------------------------------------------------------

function AgentProgressPanel({ run }: { run: AgentPipelineRun }) {
  const currentIdx = getPhaseIndex(run.phase);
  const progress = run.progress as {
    message?: string;
    currentProgram?: string;
    programsDone?: number;
    programsTotal?: number;
  };
  const total = run.programsCount || (progress.programsTotal ?? 0);
  const done = run.programsDone || (progress.programsDone ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="ml-11 mt-2 mb-1">
      <div className="glass-card-static border-l-4 border-l-terracotta p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-foreground mb-1">
          <Loader2 className="w-3.5 h-3.5 text-terracotta animate-spin" />
          AI Agent Running
        </div>

        {/* Phase checklist */}
        <div className="space-y-1.5">
          {AGENT_PHASES.map((phase, i) => {
            const isDone = i < currentIdx || run.status === "completed";
            const isCurrent = i === currentIdx && run.status !== "completed";
            return (
              <div key={phase.key} className="flex items-center gap-2">
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-olive flex-shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 text-terracotta animate-spin flex-shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
                )}
                <span
                  className={`text-[11px] font-mono ${
                    isDone
                      ? "text-olive"
                      : isCurrent
                        ? "text-foreground font-bold"
                        : "text-muted-foreground"
                  }`}
                >
                  {phase.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current detail message */}
        {progress.message && (
          <p className="text-[11px] font-sans text-muted-foreground leading-relaxed">
            {progress.message}
          </p>
        )}

        {/* Progress bar */}
        {total > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
              <span>
                {done}/{total} programs
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full progress-gradient rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Success Panel
// ---------------------------------------------------------------------------

function AgentSuccessPanel({
  run,
  programs,
}: {
  run: AgentPipelineRun;
  programs: Program[];
}) {
  const readyPrograms = programs.filter(
    (p) => p.status === "ready" || p.status === "active"
  );

  return (
    <div className="ml-11 mt-2 mb-1">
      <div className="glass-card-static border-l-4 border-l-olive p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-olive mb-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-bold">
            {run.programsDone} program{run.programsDone !== 1 ? "s" : ""} ready
            for review!
          </span>
        </div>

        <div className="flex items-start justify-between">
          <p className="text-xs font-sans text-muted-foreground">
            AI agent has generated emails, SMS, WhatsApp, RCS messages, and workflows.
            Review the content and activate when you&apos;re ready.
          </p>
          <Link
            href="/automations"
            className="flex items-center gap-1 px-2.5 py-1 bg-white/40 border border-white/30 rounded-lg text-[10px] font-mono text-olive hover:bg-white/60 transition-all whitespace-nowrap flex-shrink-0 ml-3"
          >
            Review Automations
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>

        {readyPrograms.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {readyPrograms.slice(0, 6).map((program) => (
              <div
                key={program.id}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white/30 border border-white/20 rounded-lg"
              >
                <Sparkles className="w-3 h-3 text-olive flex-shrink-0" />
                <span className="text-[11px] font-mono text-foreground truncate flex-1">
                  {program.name}
                </span>
                <span className="px-1.5 py-0.5 rounded border text-[9px] font-mono whitespace-nowrap bg-olive/10 text-olive border-olive/20">
                  {program.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Summary Panels
// ---------------------------------------------------------------------------

function SyncSuccessPanel({
  products,
  customers,
  orders,
}: {
  products: number;
  customers: number;
  orders: number;
}) {
  return (
    <div className="ml-11 mt-2 mb-1 space-y-2">
      <div className="flex items-center gap-2 text-xs font-mono text-olive">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="font-bold">Sync complete!</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Products", value: products, icon: Package },
          { label: "Customers", value: customers, icon: Users },
          { label: "Orders", value: orders, icon: ShoppingCart },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/30 border border-white/20"
          >
            <item.icon className="w-3.5 h-3.5 text-olive" />
            <div>
              <div className="text-sm font-mono font-bold text-foreground tabular-nums">
                {item.value.toLocaleString()}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncProgressPanel({
  products,
  customers,
  orders,
}: {
  products: number;
  customers: number;
  orders: number;
}) {
  return (
    <div className="ml-11 mt-2 mb-1 space-y-2">
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Importing data from your store...</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Products", value: products, icon: Package },
          { label: "Customers", value: customers, icon: Users },
          { label: "Orders", value: orders, icon: ShoppingCart },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20 border border-white/10 animate-pulse"
          >
            <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <div className="text-sm font-mono font-bold text-foreground tabular-nums">
                {item.value.toLocaleString()}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase">
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandAnalyzingPanel() {
  return (
    <div className="ml-11 mt-2 mb-1">
      <div className="glass-card-static border-l-4 border-l-terracotta p-4">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="w-3.5 h-3.5 text-terracotta animate-spin" />
          <span className="text-xs font-mono font-bold text-foreground">
            Analyzing your brand...
          </span>
        </div>
        <p className="text-[11px] font-sans text-muted-foreground leading-relaxed">
          AI is reading your product catalog to extract brand personality, tone of
          voice, visual style, and color palette. This usually takes 10-20 seconds.
        </p>
      </div>
    </div>
  );
}

function BrandSummaryPanel({ profile }: { profile: BrandProfile }) {
  if (!profile) return null;
  const tone = profile.toneAttributes;
  const visual = profile.visualStyle;
  const colors = Array.isArray(visual?.["suggestedColors"])
    ? visual["suggestedColors"]
    : [];

  return (
    <div className="ml-11 mt-2 mb-1">
      <div className="glass-card-static border-l-4 border-l-olive p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-olive mb-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-bold">Brand analysis complete!</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-mono font-bold text-foreground">
              {profile.brandName}
            </p>
            <p className="text-xs font-sans text-muted-foreground mt-0.5 line-clamp-2">
              {profile.brandDescription}
            </p>
          </div>
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-1 px-2.5 py-1 bg-white/40 border border-white/30 rounded-lg text-[10px] font-mono text-olive hover:bg-white/60 transition-all whitespace-nowrap flex-shrink-0"
          >
            View Details
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {tone && (
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 text-olive" />
              <div className="flex gap-1 flex-wrap">
                {Object.entries(tone)
                  .slice(0, 3)
                  .map(([key, val]) => (
                    <span
                      key={key}
                      className="px-1.5 py-0.5 bg-white/40 border border-white/20 rounded text-[10px] font-mono text-foreground"
                    >
                      {key}: {val}
                    </span>
                  ))}
              </div>
            </div>
          )}
          {colors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Palette className="w-3 h-3 text-olive" />
              <div className="flex gap-1">
                {colors.slice(0, 4).map((color: string, i: number) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full border border-white/30"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup Checklist
// ---------------------------------------------------------------------------

function SetupChecklist({
  steps,
  syncCounts,
  isSyncing,
  syncDone,
  isAnalyzing,
  brandProfile,
  brandDone,
  agentRun,
  isAgentRunning,
  agentDone,
  programs,
  aiModels,
  selectedModel,
  onModelSelect,
  isModelSaving,
  modelLocked,
  currentCreativeIntensity,
  onCreativeSelect,
  isCreativeSaving,
  creativeLocked,
}: {
  steps: SetupStep[];
  syncCounts?: { products: number; customers: number; orders: number };
  isSyncing: boolean;
  syncDone: boolean;
  isAnalyzing: boolean;
  brandProfile: BrandProfile;
  brandDone: boolean;
  agentRun: AgentPipelineRun | null;
  isAgentRunning: boolean;
  agentDone: boolean;
  programs: Program[];
  aiModels?: { id: string; label: string; provider: string; description: string; available: boolean; tier: string; inputCostPerMillion: number; outputCostPerMillion: number }[];
  selectedModel: string | null;
  onModelSelect: (model: string) => void;
  isModelSaving: boolean;
  modelLocked: boolean;
  currentCreativeIntensity: string;
  onCreativeSelect: (value: string) => void;
  isCreativeSaving: boolean;
  creativeLocked: boolean;
}) {
  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const nextStep = steps.find((s) => !s.done);
  const progressPct = Math.round((completedCount / steps.length) * 100);

  if (allDone) return null;

  return (
    <div className="glass-card-static overflow-hidden">
      <div className="px-6 py-5 border-b border-white/15">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="section-header accent-bar-left text-[13px] text-foreground">
              GET STARTED
            </h2>
            <p className="text-[11px] text-muted-foreground font-sans mt-0.5 pl-4">
              Complete these steps to unlock the full power of AlloHQ
            </p>
          </div>
          <span className="text-[12px] font-mono text-muted-foreground">
            {completedCount}/{steps.length} complete
          </span>
        </div>
        <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full progress-gradient rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="divide-y divide-white/10">
        {steps.map((step, i) => {
          const isNext = step === nextStep;
          const priorStepsDone = steps.slice(0, i).every((s) => s.done);
          const isModelEditable = step.key === "model" && step.done && !modelLocked && priorStepsDone;
          const isCreativeEditable = step.key === "creative" && step.done && !creativeLocked && priorStepsDone;
          const showAsDone = step.done && !isModelEditable && !isCreativeEditable;

          return (
            <div key={step.key}>
              <div
                className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                  showAsDone ? "opacity-60" : isNext || isModelEditable || isCreativeEditable ? "bg-white/10" : ""
                }`}
              >
                {/* Step indicator */}
                <div className="flex-shrink-0">
                  {showAsDone ? (
                    <div className="w-7 h-7 rounded-full bg-olive flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white">
                        <path
                          d="M3 7.5L5.5 10L11 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray="20"
                          strokeDashoffset="0"
                          style={{ animation: "check-draw 0.4s ease-out" }}
                        />
                      </svg>
                    </div>
                  ) : isModelEditable || isCreativeEditable ? (
                    <div className="w-7 h-7 rounded-full bg-olive flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  ) : step.loading ? (
                    <div className="w-7 h-7 rounded-full border-2 border-terracotta flex items-center justify-center animate-pulse-terracotta">
                      <Loader2 className="w-3.5 h-3.5 text-terracotta animate-spin" />
                    </div>
                  ) : isNext ? (
                    <div className="w-7 h-7 rounded-full bg-terracotta flex items-center justify-center" style={{ animation: "pulse-dot 2s ease-in-out infinite" }}>
                      <span className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full border-2 border-white/20 flex items-center justify-center">
                      <span className="text-xs font-mono text-muted-foreground/50">
                        {i + 1}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <step.icon
                      className={`w-3.5 h-3.5 ${
                        showAsDone
                          ? "text-muted-foreground"
                          : isModelEditable || isCreativeEditable
                            ? "text-olive"
                            : step.loading
                              ? "text-terracotta"
                              : isNext
                                ? "text-terracotta"
                                : "text-muted-foreground/50"
                      } ${step.loading && step.key === "sync" ? "animate-spin" : ""}`}
                    />
                    <h3
                      className={`text-[13px] font-mono font-semibold ${
                        showAsDone
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {step.loading
                        ? (step.loadingLabel ?? step.label)
                        : step.label}
                    </h3>
                  </div>
                  <p className="text-[11px] font-sans text-muted-foreground mt-0.5 ml-5.5">
                    {step.description}
                  </p>
                </div>

                {/* CTA */}
                {!step.done && !step.loading && isNext && step.onAction && (
                  <button
                    onClick={step.onAction}
                    className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all whitespace-nowrap"
                  >
                    {step.ctaLabel}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                {!step.done &&
                  !step.loading &&
                  isNext &&
                  !step.onAction &&
                  step.href && (
                    <Link
                      href={step.href}
                      className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all whitespace-nowrap"
                    >
                      {step.ctaLabel}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                {step.loading && (
                  <span className="text-[10px] font-mono text-terracotta whitespace-nowrap animate-pulse">
                    Working...
                  </span>
                )}
                {!step.done && !step.loading && !isNext && (
                  <span className="text-[10px] font-mono text-muted-foreground/50 whitespace-nowrap">
                    Pending
                  </span>
                )}
                {(isModelEditable || isCreativeEditable) && (
                  <span className="text-[10px] font-mono text-olive whitespace-nowrap">
                    Editable
                  </span>
                )}
                {showAsDone && (
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                    Done
                  </span>
                )}
              </div>

              {/* Inline feedback panels */}
              <div className="px-6">
                {step.key === "model" && !modelLocked && (isNext || isModelEditable) && aiModels && (
                  <div className="pb-4">
                    <InlineModelPicker
                      models={aiModels as any}
                      selectedModel={selectedModel}
                      onSelect={onModelSelect}
                      isPending={isModelSaving}
                    />
                  </div>
                )}
                {step.key === "sync" && isSyncing && syncCounts && (
                  <div className="pb-4">
                    <SyncProgressPanel
                      products={syncCounts.products}
                      customers={syncCounts.customers}
                      orders={syncCounts.orders}
                    />
                  </div>
                )}
                {step.key === "sync" && syncDone && !isSyncing && syncCounts && (
                  <div className="pb-4">
                    <SyncSuccessPanel
                      products={syncCounts.products}
                      customers={syncCounts.customers}
                      orders={syncCounts.orders}
                    />
                  </div>
                )}
                {step.key === "brand" && isAnalyzing && (
                  <div className="pb-4">
                    <BrandAnalyzingPanel />
                  </div>
                )}
                {step.key === "brand" && brandDone && !isAnalyzing && brandProfile && (
                  <div className="pb-4">
                    <BrandSummaryPanel profile={brandProfile} />
                  </div>
                )}
                {step.key === "creative" && !creativeLocked && (isNext || isCreativeEditable) && (
                  <div className="pb-4">
                    <InlineCreativeIntensityPicker
                      current={currentCreativeIntensity}
                      onSelect={onCreativeSelect}
                      isPending={isCreativeSaving}
                    />
                  </div>
                )}
                {step.key === "agent" && isAgentRunning && agentRun && (
                  <div className="pb-4">
                    <AgentProgressPanel run={agentRun} />
                  </div>
                )}
                {step.key === "agent" && agentDone && !isAgentRunning && agentRun && (
                  <div className="pb-4">
                    <AgentSuccessPanel run={agentRun} programs={programs} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mission Control Section
// ---------------------------------------------------------------------------

function MissionControlSection({ storeId }: { storeId: string }) {
  const { data: missionControl, isLoading } = (trpc as any).briefings.missionControl.useQuery(
    { storeId },
    { enabled: !!storeId, refetchInterval: 60000 },
  ) as { data: any | undefined; isLoading: boolean };

  const { data: latestBriefing } = (trpc as any).briefings.latest.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any | undefined };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-skeleton h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!missionControl) return null;

  const mc = missionControl;
  const briefingContent = latestBriefing?.content as any;

  return (
    <div className="space-y-4">
      {/* Briefing narrative */}
      {briefingContent && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-[#6B7A2F]" />
            <span className="text-xs font-medium uppercase tracking-wide text-[#8B8074]">
              {briefingContent.title || "Morning Briefing"}
            </span>
          </div>
          <p className="text-sm text-[#5C5549]">{briefingContent.summary || "No briefing available yet."}</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Since you were last here */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">
            Since you were last here
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">Revenue</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">
                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(mc.sinceLastVisit?.revenue ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">Orders</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.sinceLastVisit?.orders ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">New customers</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.sinceLastVisit?.newCustomers ?? 0}</span>
            </div>
          </div>
        </motion.div>

        {/* Needs your attention */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">
            Needs your attention
          </h3>
          <div className="space-y-2">
            <Link href="/actions" className="flex items-center justify-between group">
              <span className="text-sm text-[#5C5549] group-hover:text-[#2C2C2C] transition-colors">
                Pending actions
              </span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">
                {mc.needsAttention?.pendingActions ?? 0}
              </span>
            </Link>
            {(mc.needsAttention?.urgentActions ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Urgent
                </span>
                <span className="text-sm font-semibold text-red-600 font-mono">
                  {mc.needsAttention.urgentActions}
                </span>
              </div>
            )}
            {(mc.needsAttention?.inventoryAlerts ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-amber-600">Low stock alerts</span>
                <span className="text-sm font-semibold text-amber-600 font-mono">
                  {mc.needsAttention.inventoryAlerts}
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* What Allo did */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">
            What Allo did
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">Campaigns sent</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.alloActivity?.campaignsSent ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">Emails delivered</span>
              <span className="text-sm font-semibold text-[#2C2C2C] font-mono">{mc.alloActivity?.emailsSent ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#5C5549]">AI-attributed revenue</span>
              <span className="text-sm font-semibold text-[#6B7A2F] font-mono">
                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(mc.alloActivity?.revenue ?? 0)}
              </span>
            </div>
            {(mc.alloActivity?.suppressedCount ?? 0) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#8B8074]">Suppressed (governor)</span>
                <span className="text-sm text-[#8B8074] font-mono">{mc.alloActivity.suppressedCount}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Today's opportunities */}
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#8B8074] mb-3">
            Opportunities
          </h3>
          {(mc.opportunities?.length ?? 0) === 0 ? (
            <p className="text-sm text-[#8B8074]">No new opportunities detected</p>
          ) : (
            <div className="space-y-2">
              {(mc.opportunities as any[]).slice(0, 3).map((opp: any, i: number) => (
                <div key={i} className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[#5C5549] line-clamp-1">{opp.description}</span>
                    <span className="text-xs text-[#8B8074]">{opp.customerCount} customers</span>
                  </div>
                  <span className="text-xs font-semibold text-[#6B7A2F] font-mono shrink-0 ml-2">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(opp.estimatedRevenue ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  // ---- Sync state ----
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [preSyncLastSyncAt, setPreSyncLastSyncAt] = useState<string | null>(
    null
  );

  // ---- Brand analysis state ----
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [brandDone, setBrandDone] = useState(false);
  const [brandJobId, setBrandJobId] = useState<string | null>(null);
  const prevAnalyzedAt = useRef<string | null>(null);
  const analyzeStartedAt = useRef<number>(0);

  // ---- Agent pipeline state ----
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentDone, setAgentDone] = useState(false);

  // ---- Queries ----
  const { data: health, isLoading: healthLoading } =
    trpc.health.check.useQuery();
  const { data: stats, isLoading: statsLoading } =
    trpc.dashboard.stats.useQuery(undefined, {
      refetchInterval: isSyncing ? 3000 : false,
    });
  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    refetchInterval: isSyncing ? 3000 : false,
  });

  const storeId = stores?.[0]?.id ?? "";
  const hasStore = !!storeId;
  const store = stores?.[0];

  const { data: brandProfile } = (trpc.ai.brandProfile as any).useQuery(
    { storeId },
    {
      enabled: !!storeId,
      refetchInterval: isAnalyzing ? 3000 : false,
    }
  ) as { data: BrandProfile | undefined };

  const { data: brandStatus } = (
    trpc.ai.brandProfileStatus as any
  ).useQuery({ storeId }, { enabled: !!storeId }) as {
    data: { exists: boolean } | undefined;
  };

  const { data: brandJobStatus } = (
    trpc.ai.brandAnalysisStatus as any
  ).useQuery(
    { jobId: brandJobId! },
    { enabled: !!brandJobId && isAnalyzing, refetchInterval: 3000 }
  ) as {
    data: { status: string; failedReason?: string } | undefined;
  };

  const { data: programs } = (trpc.automations.list as any).useQuery(
    storeId ? { storeId } : undefined,
    {
      enabled: !!storeId,
      refetchInterval: isAgentRunning ? 3000 : false,
    }
  ) as { data: Program[] | undefined };

  // Agent pipeline status polling
  const { data: agentRunData } = (trpc.automations.agentStatus as any).useQuery(
    { pipelineRunId: agentRunId! },
    {
      enabled: !!agentRunId && isAgentRunning,
      refetchInterval: 2000,
    }
  ) as { data: AgentPipelineRun | undefined };

  // On page load, check for latest agent run (resume tracking)
  const { data: latestAgentRun } = (
    trpc.automations.latestAgentRun as any
  ).useQuery({ storeId }, { enabled: !!storeId }) as {
    data: AgentPipelineRun | undefined;
  };

  // AI model settings
  const { data: aiModels } = trpc.ai.models.useQuery();
  const { data: aiSettings } = (trpc.ai.getSettings as any).useQuery() as {
    data: { defaultModel: string | null } | undefined;
  };
  const setDefaultModel = (trpc.ai.setDefaultModel as any).useMutation({
    onSuccess: () => {
      (utils.ai as any).getSettings.invalidate();
    },
  }) as { mutate: (input: { model: string | null }) => void; isPending: boolean };

  // Creative intensity mutation
  const updateIntensity = (trpc.ai.updateCreativeIntensity as any).useMutation({
    onSuccess: () => {
      (utils.ai as any).brandProfileStatus.invalidate();
    },
  }) as { mutate: (input: { storeId: string; creativeIntensity: string }) => void; isPending: boolean };

  // Token usage for AI cost card
  const { data: tokenUsage } = (trpc.dashboard.tokenUsage as any).useQuery() as {
    data: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCalls: number;
      totalCost: number;
      byModel: { model: string; inputTokens: number; outputTokens: number; calls: number; cost: number }[];
    } | undefined;
  };

  // Segments list (for condensed dashboard)
  const { data: segmentsList } = trpc.segments.list.useQuery();

  // Customer stats (for attention needed)
  const { data: customerStats } = (trpc.customers.stats as any).useQuery() as {
    data: { totalCustomers: number; acceptsMarketing: number; marketingRate: number; totalRevenue: number; avgOrderValue: number } | undefined;
  };

  // Segment distribution (for customer health)
  const { data: segmentDist } = (trpc.segments.distribution as any).useQuery() as {
    data: { segment: string; customerCount: number; totalRevenue: number; avgOrderValue: number }[] | undefined;
  };

  // Resume tracking on page load — only for in-progress pipelines.
  // Completed runs are NOT resumed; we rely on hasReadyOrActivePrograms instead.
  useEffect(() => {
    if (!latestAgentRun) return;
    if (
      latestAgentRun.status === "running" ||
      latestAgentRun.status === "pending"
    ) {
      setAgentRunId(latestAgentRun.id);
      setIsAgentRunning(true);
      setAgentDone(false);
    }
  }, [latestAgentRun?.id, latestAgentRun?.status]);

  // Watch agent pipeline completion
  useEffect(() => {
    if (!agentRunData || !isAgentRunning) return;
    if (
      agentRunData.status === "completed" ||
      agentRunData.status === "failed"
    ) {
      setIsAgentRunning(false);
      setAgentDone(agentRunData.status === "completed");
      (utils.automations as any).list.invalidate();
    }
  }, [agentRunData?.status, isAgentRunning]);

  const utils = trpc.useUtils();

  // ---- Sync mutation ----
  const triggerSync = trpc.stores.triggerSync.useMutation({
    onSuccess: () => {
      setIsSyncing(true);
      setSyncDone(false);
      setPreSyncLastSyncAt(store?.lastSyncAt ?? null);
    },
  });

  const storeLastSyncAt = store?.lastSyncAt ?? null;
  useEffect(() => {
    if (!isSyncing) return;
    if (storeLastSyncAt && storeLastSyncAt !== preSyncLastSyncAt) {
      setIsSyncing(false);
      setSyncDone(true);
      utils.stores.list.invalidate();
      utils.dashboard.stats.invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, storeLastSyncAt, preSyncLastSyncAt]);

  const handleSyncClick = useCallback(() => {
    if (!storeId || triggerSync.isPending || isSyncing) return;
    triggerSync.mutate({ storeId });
  }, [storeId, triggerSync, isSyncing]);

  // ---- Brand analysis mutation ----
  const analyzeBrand = trpc.ai.analyzeBrand.useMutation({
    onSuccess: (data) => {
      setIsAnalyzing(true);
      setBrandDone(false);
      setBrandJobId((data as any).jobId ?? null);
      analyzeStartedAt.current = Date.now();
      prevAnalyzedAt.current = (brandProfile as any)?.analyzedAt ?? null;
    },
  });

  useEffect(() => {
    if (!isAnalyzing) return;

    if (brandJobStatus?.status === "failed") {
      setIsAnalyzing(false);
      setBrandJobId(null);
      return;
    }

    if (
      brandProfile?.analyzedAt &&
      brandProfile.analyzedAt !== prevAnalyzedAt.current
    ) {
      setIsAnalyzing(false);
      setBrandJobId(null);
      setBrandDone(true);
      (utils.ai as any).brandProfile.invalidate();
      (utils.ai as any).brandProfileStatus.invalidate();
      return;
    }

    if (Date.now() - analyzeStartedAt.current > 90000) {
      setIsAnalyzing(false);
      setBrandJobId(null);
    }
  }, [brandProfile?.analyzedAt, brandJobStatus, isAnalyzing, utils]);

  const handleBrandAnalyze = useCallback(() => {
    if (!storeId || analyzeBrand.isPending || isAnalyzing) return;
    analyzeBrand.mutate({ storeId });
  }, [storeId, analyzeBrand, isAnalyzing]);

  // ---- Agent pipeline mutation ----
  const launchAgent = (trpc.automations.launchAgent as any).useMutation({
    onSuccess: (data: { pipelineRunId: string }) => {
      setAgentRunId(data.pipelineRunId);
      setIsAgentRunning(true);
      setAgentDone(false);
    },
    onError: () => {
      setIsAgentRunning(false);
    },
  }) as { mutate: (input: { storeId: string }) => void; isPending: boolean };

  const handleLaunchAgent = useCallback(() => {
    if (!storeId || launchAgent.isPending || isAgentRunning) return;
    launchAgent.mutate({ storeId });
  }, [storeId, launchAgent, isAgentRunning]);

  // ---- Model selection handler ----
  const handleModelSelect = useCallback(
    (modelId: string) => {
      setDefaultModel.mutate({ model: modelId });
    },
    [setDefaultModel]
  );

  const handleCreativeSelect = useCallback(
    (value: string) => {
      if (!storeId) return;
      updateIntensity.mutate({ storeId, creativeIntensity: value });
    },
    [storeId, updateIntensity]
  );

  // ---- Compute step states ----
  const hasSyncedData = (stats?.totalCustomers ?? 0) > 0;
  const hasDefaultModel = !!aiSettings?.defaultModel;
  const hasBrand = brandStatus?.exists ?? false;
  const currentCreativeIntensity = (brandStatus as any)?.creativeIntensity ?? "balanced";
  const hasReadyOrActivePrograms =
    programs?.some((p) => p.status === "ready" || p.status === "active") ?? false;

  const syncCounts = store?._count
    ? {
        products: store._count.products,
        customers: store._count.customers,
        orders: store._count.orders,
      }
    : undefined;

  const setupSteps: SetupStep[] = [
    {
      key: "connect",
      label: "Connect your store",
      description:
        "Link your Shopify store to import products, customers, and orders",
      href: "/integrations",
      ctaLabel: "Connect Store",
      icon: Store,
      done: hasStore,
    },
    {
      key: "sync",
      label: "Sync store data",
      description:
        "Import your product catalog, customer list, and order history",
      ctaLabel: "Sync Data",
      icon: RefreshCw,
      done: hasSyncedData && !isSyncing,
      onAction: hasStore ? handleSyncClick : undefined,
      href: hasStore ? undefined : "/integrations",
      loading: isSyncing,
      loadingLabel: "Syncing store data...",
    },
    {
      key: "model",
      label: "Choose your AI model",
      description:
        "Select the default model for all AI-generated content",
      ctaLabel: "Select Model",
      icon: Cpu,
      done: hasDefaultModel && hasSyncedData && !isSyncing,
    },
    {
      key: "brand",
      label: "Analyze your brand voice",
      description:
        "AI reads your store and extracts brand personality, tone, and colors",
      ctaLabel: "Analyze Brand",
      icon: Palette,
      done: hasBrand && !isAnalyzing,
      onAction: hasStore ? handleBrandAnalyze : undefined,
      href: hasStore ? undefined : "/integrations",
      loading: isAnalyzing || analyzeBrand.isPending,
      loadingLabel: "Analyzing brand voice...",
    },
    {
      key: "creative",
      label: "Choose creative balance",
      description:
        "Control how visual vs text-focused your generated content will be",
      ctaLabel: "Select Style",
      icon: SlidersHorizontal,
      done: hasBrand && !isAnalyzing,
    },
    {
      key: "agent",
      label: "Launch AI Marketing Agent",
      description:
        "Recommend automations, generate emails + SMS + WhatsApp + RCS, and create workflows",
      ctaLabel: "Launch Agent",
      icon: Bot,
      done: hasReadyOrActivePrograms && !isAgentRunning,
      onAction: hasStore ? handleLaunchAgent : undefined,
      href: hasStore ? undefined : "/integrations",
      loading: isAgentRunning || launchAgent.isPending,
      loadingLabel: "AI Agent running...",
    },
  ];

  const allSetupDone = setupSteps.every((s) => s.done);

  // Computed values for condensed dashboard layout
  const readyCampaigns = programs?.filter((p) => p.status === "ready" || p.status === "active").length ?? 0;
  const modelLabel = (aiModels as any)?.find((m: any) => m.id === aiSettings?.defaultModel)?.label ?? aiSettings?.defaultModel;
  const creativeLabel = CREATIVE_OPTIONS.find((o) => o.value === currentCreativeIntensity)?.label ?? "Balanced";

  // Attention items computation
  const attentionItems: { level: "urgent" | "moderate" | "positive"; text: string; detail: string; action: string; href: string }[] = [];

  if (allSetupDone && segmentDist) {
    const hibernating = segmentDist.find((s) => s.segment === "Lost" || s.segment === "Hibernating");
    if (hibernating && hibernating.customerCount > 0) {
      attentionItems.push({
        level: "urgent",
        text: `${hibernating.customerCount} customers are ${hibernating.segment} with $${Math.round(hibernating.totalRevenue).toLocaleString()} revenue`,
        detail: "These customers haven't purchased recently.",
        action: "Launch Win-Back Campaign \u2192",
        href: "/automations",
      });
    }
  }

  if (allSetupDone && customerStats && customerStats.marketingRate === 0) {
    attentionItems.push({
      level: "moderate",
      text: "Marketing opt-in rate is 0%",
      detail: "No customers have opted into email/SMS marketing.",
      action: "Set Up Collection \u2192",
      href: "/settings",
    });
  }

  if (allSetupDone && programs) {
    const readyNotLive = programs.filter((p) => p.status === "ready");
    if (readyNotLive.length > 0) {
      attentionItems.push({
        level: "positive",
        text: `${readyNotLive.length} automation${readyNotLive.length > 1 ? "s are" : " is"} ready but not live`,
        detail: readyNotLive.map((p) => p.name).join(", ") + (readyNotLive.length > 1 ? " are generated." : " is generated."),
        action: "Review & Go Live \u2192",
        href: "/automations",
      });
    }
  }

  // AI activity computation
  const aiCost = tokenUsage?.totalCost ?? 0;
  const aiCalls = tokenUsage?.totalCalls ?? 0;
  // Rough savings estimate: each automation ~2hrs manual ($100), brand analysis ~4hrs ($200), segmentation ~3hrs ($150)
  const automationCount = programs?.filter((p) => p.status !== "recommended").length ?? 0;
  const estimatedSavings = automationCount * 100 + (hasBrand ? 200 : 0) + (hasSyncedData ? 150 : 0);

  // Segment colors for health bar
  const SEGMENT_COLORS: Record<string, string> = {
    Champions: "#6B7A2F",
    "Loyal Customers": "#B8963E",
    "Potential Loyalists": "#C4704A",
    "New Customers": "#8A7D6B",
    "At Risk": "#C44A4A",
    Hibernating: "#999",
    Lost: "#888",
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ---- State A: Setup Incomplete / State B: Setup Complete ---- */}
      {allSetupDone ? (
        <>
          {/* Slim header with inline status pills */}
          <motion.div variants={itemVariants} className="glass-card-static px-8 py-5">
            <h1 className="section-header accent-bar-left text-[22px] text-foreground tracking-[-0.5px] mb-1">
              DASHBOARD
            </h1>
            <p className="text-[13px] text-muted-foreground font-sans pl-4">
              AlloHQ — Marketing automation for e-commerce
            </p>
            <div className="mt-3 flex items-center gap-2 pl-4 flex-wrap">
              {/* Status pills */}
              <Link href="/integrations" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#6B7A2F] hover:bg-black/[0.07] transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6B7A2F]" /> Connected
              </Link>
              {aiSettings?.defaultModel && (
                <Link href="/settings" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#B8963E] hover:bg-black/[0.07] transition-colors">
                  <Zap className="w-3 h-3" /> {modelLabel}
                </Link>
              )}
              <Link href="/settings" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#8A7D6B] hover:bg-black/[0.07] transition-colors">
                <SlidersHorizontal className="w-3 h-3" /> {creativeLabel}
              </Link>
              {hasBrand && (
                <Link href="/intelligence/brand" className="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] text-[#8A7D6B] hover:bg-black/[0.07] transition-colors">
                  <Check className="w-3 h-3" /> Brand
                </Link>
              )}
            </div>
          </motion.div>

          {/* Mission Control */}
          <MissionControlSection storeId={storeId} />

          {/* Smart nav grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CUSTOMERS */}
            <motion.div variants={itemVariants}>
              <Link href="/customers" className="block glass-card p-5 group">
                <div className="flex items-center justify-between mb-2">
                  <div className="section-header text-[10px] text-muted-foreground">CUSTOMERS</div>
                  <span className="trend-pill-up"><TrendingUp className="w-3 h-3 inline mr-1" />+12%</span>
                </div>
                <div className="text-[32px] font-bold text-foreground font-mono tabular-nums leading-tight">
                  <AnimatedNumber value={stats?.totalCustomers ?? 0} />
                </div>
                <div className="mt-2"><Sparkline data={SPARK_CUSTOMERS} color="var(--olive)" /></div>
              </Link>
            </motion.div>

            {/* SEGMENTS */}
            <motion.div variants={itemVariants}>
              <Link href="/segments" className="block glass-card p-5 group">
                <div className="section-header text-[10px] text-muted-foreground mb-2">SEGMENTS</div>
                <div className="text-[32px] font-bold text-foreground font-mono tabular-nums leading-tight">
                  <AnimatedNumber value={(segmentsList as any)?.length ?? 0} />
                </div>
                <p className="text-[11px] text-muted-foreground font-sans mt-2">active segments</p>
              </Link>
            </motion.div>

            {/* CAMPAIGNS */}
            <motion.div variants={itemVariants}>
              <Link href="/campaigns" className="block glass-card p-5 group">
                <div className="section-header text-[10px] text-muted-foreground mb-2">CAMPAIGNS</div>
                {readyCampaigns > 0 ? (
                  <>
                    <div className="text-[32px] font-bold text-foreground font-mono tabular-nums leading-tight">
                      <AnimatedNumber value={readyCampaigns} />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-sans mt-2">ready to send</p>
                  </>
                ) : (
                  <p className="text-[13px] text-terracotta font-mono font-semibold mt-4">Launch your first &rarr;</p>
                )}
              </Link>
            </motion.div>

            {/* REVENUE */}
            <motion.div variants={itemVariants}>
              <Link href="/analytics" className="block glass-card p-5 group">
                <div className="flex items-center justify-between mb-2">
                  <div className="section-header text-[10px] text-muted-foreground">REVENUE</div>
                  <span className="trend-pill-up"><TrendingUp className="w-3 h-3 inline mr-1" />+8%</span>
                </div>
                <div className="text-[32px] font-bold text-[#6B7A2F] font-mono tabular-nums leading-tight">
                  <AnimatedNumber value={stats?.revenueThisMonth ?? 0} prefix="$" />
                </div>
                <div className="mt-2"><Sparkline data={SPARK_REVENUE} color="var(--olive)" /></div>
              </Link>
            </motion.div>
          </div>
        </>
      ) : (
        <>
          {/* Header */}
          <motion.div variants={itemVariants} className="glass-card-static p-8">
            <h1 className="section-header accent-bar-left text-[22px] text-foreground tracking-[-0.5px] mb-1">
              DASHBOARD
            </h1>
            <p className="text-[13px] text-muted-foreground font-sans pl-4">
              AlloHQ — Marketing automation for e-commerce
            </p>
            <div className="mt-5 flex items-center gap-3 pl-4">
              <div
                className={`w-2 h-2 rounded-full ${
                  healthLoading
                    ? "bg-muted-foreground/50 animate-pulse"
                    : health
                      ? "bg-olive"
                      : "bg-muted-foreground/50"
                }`}
              />
              <span className="text-xs font-mono text-muted-foreground">
                {healthLoading
                  ? "Checking API..."
                  : health
                    ? "API connected"
                    : "API offline"}
              </span>
            </div>
          </motion.div>

          {/* Setup checklist */}
          <motion.div variants={itemVariants}>
            <SetupChecklist
              steps={setupSteps}
              syncCounts={syncCounts}
              isSyncing={isSyncing}
              syncDone={syncDone}
              isAnalyzing={isAnalyzing || analyzeBrand.isPending}
              brandProfile={brandProfile ?? null}
              brandDone={brandDone || (hasBrand && !isAnalyzing)}
              agentRun={agentRunData ?? latestAgentRun ?? null}
              isAgentRunning={isAgentRunning}
              agentDone={agentDone && hasReadyOrActivePrograms}
              programs={programs ?? []}
              aiModels={aiModels as any}
              selectedModel={aiSettings?.defaultModel ?? null}
              onModelSelect={handleModelSelect}
              isModelSaving={setDefaultModel.isPending}
              modelLocked={hasBrand || isAnalyzing || analyzeBrand.isPending}
              currentCreativeIntensity={currentCreativeIntensity}
              onCreativeSelect={handleCreativeSelect}
              isCreativeSaving={updateIntensity.isPending}
              creativeLocked={isAgentRunning || (agentDone && hasReadyOrActivePrograms)}
            />
          </motion.div>

          {/* Selections summary — visible when agent is running */}
          {isAgentRunning && aiSettings?.defaultModel && (
            <motion.div variants={itemVariants}>
              <SelectionsSummary
                modelLabel={
                  (aiModels as any)?.find((m: any) => m.id === aiSettings.defaultModel)?.label
                  ?? aiSettings.defaultModel
                }
                creativeIntensity={currentCreativeIntensity}
              />
            </motion.div>
          )}

          {/* Quick nav cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "CUSTOMERS",
                description: "View & manage customer profiles",
                icon: Users,
                href: "/customers",
              },
              {
                title: "SEGMENTS",
                description: "RFM-based segmentation",
                icon: Layers,
                href: "/segments",
              },
              {
                title: "INTELLIGENCE",
                description: "RFM analysis & LTV insights",
                icon: Brain,
                href: "/intelligence",
              },
              {
                title: "CAMPAIGNS",
                description: "Email, SMS, WhatsApp",
                icon: Zap,
                href: "/campaigns",
              },
            ].map((item) => (
              <motion.div key={item.title} variants={itemVariants}>
                <Link
                  href={item.href}
                  className="block glass-card p-6 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <item.icon className="w-6 h-6 text-muted-foreground/50 group-hover:text-terracotta transition-colors duration-200" />
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-terracotta transition-colors duration-200" />
                  </div>
                  <h3 className="section-header text-[12px] text-foreground mb-1">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-muted-foreground font-sans">
                    {item.description}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Stats */}
          {hasSyncedData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: "TOTAL CUSTOMERS",
                  value: stats?.totalCustomers ?? 0,
                  prefix: "",
                  spark: SPARK_CUSTOMERS,
                  trend: "+12%",
                  trendUp: true,
                },
                {
                  label: "ACTIVE CAMPAIGNS",
                  value: 0,
                  prefix: "",
                  spark: SPARK_CAMPAIGNS,
                  trend: null,
                  trendUp: false,
                },
                {
                  label: "REVENUE THIS MONTH",
                  value: stats?.revenueThisMonth ?? 0,
                  prefix: "$",
                  spark: SPARK_REVENUE,
                  trend: "+8%",
                  trendUp: true,
                },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  variants={itemVariants}
                  className="glass-card p-6"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="section-header text-[10px] text-muted-foreground">
                      {stat.label}
                    </div>
                    {stat.trend && (
                      <span className={stat.trendUp ? "trend-pill-up" : "trend-pill-down"}>
                        {stat.trendUp ? <TrendingUp className="w-3 h-3 inline mr-1" /> : <TrendingDown className="w-3 h-3 inline mr-1" />}
                        {stat.trend}
                      </span>
                    )}
                  </div>
                  {statsLoading ? (
                    <div className="h-9 w-20 glass-skeleton" />
                  ) : (
                    <div className="text-[36px] font-bold text-foreground font-mono tabular-nums leading-tight">
                      <AnimatedNumber value={stat.value} prefix={stat.prefix} />
                    </div>
                  )}
                  <div className="mt-3">
                    <Sparkline
                      data={stat.spark}
                      color={stat.trendUp ? "var(--olive)" : "var(--terracotta)"}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- Post-setup content blocks (only when setup complete) ---- */}
      {allSetupDone && (
        <>
          {/* ATTENTION NEEDED */}
          <motion.div variants={itemVariants} className="glass-card-static border-l-[3px] border-l-terracotta p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-header accent-bar-left text-[13px] text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-terracotta" />
                ATTENTION NEEDED
              </h2>
              {attentionItems.length > 0 && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  {attentionItems.length} item{attentionItems.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {attentionItems.length > 0 ? (
              <div className="space-y-0">
                {attentionItems.slice(0, 4).map((item, i) => (
                  <div key={i} className={`flex gap-3 py-3 ${i < attentionItems.length - 1 ? "border-b border-black/[0.04]" : ""}`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      item.level === "urgent" ? "bg-[#C44A4A]" : item.level === "moderate" ? "bg-[#B8963E]" : "bg-[#6B7A2F]"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-mono text-foreground font-medium">{item.text}</p>
                      <p className="text-[11px] text-muted-foreground font-sans mt-0.5">{item.detail}</p>
                      <Link href={item.href} className="text-[12px] font-mono text-terracotta hover:text-terracotta/80 transition-colors mt-1 inline-block">
                        {item.action}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <Check className="w-4 h-4 text-[#6B7A2F]" />
                <p className="text-[13px] font-sans text-muted-foreground">Everything looks good. Your store is on track.</p>
              </div>
            )}
          </motion.div>

          {/* Two-column: AI AGENT ACTIVITY + AUTOMATION STATUS */}
          <div className="grid grid-cols-[3fr_2fr] gap-5">
            {/* AI AGENT ACTIVITY */}
            <motion.div variants={itemVariants} className="glass-card-static border-l-[3px] border-l-[#B8963E] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-header accent-bar-left text-[13px] text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#B8963E]" />
                  AI AGENT ACTIVITY
                </h2>
                <span className="text-[11px] font-mono text-muted-foreground">Last 24 hours</span>
              </div>

              <div className="space-y-0">
                {/* Dynamic activity items based on real data */}
                {automationCount > 0 && (
                  <div className="flex items-start justify-between py-3 border-b border-black/[0.04]">
                    <div className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-mono text-foreground">Generated {automationCount} automations</p>
                        <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                          {programs?.filter((p) => p.status !== "recommended").map((p) => p.name).slice(0, 3).join(", ")}
                          {automationCount > 3 ? `, +${automationCount - 3} more` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {hasBrand && brandProfile && (
                  <div className="flex items-start justify-between py-3 border-b border-black/[0.04]">
                    <div className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-mono text-foreground">Analyzed brand voice for {(brandProfile as any)?.brandName ?? "your store"}</p>
                        <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                          Tone: {Object.keys((brandProfile as any)?.toneAttributes ?? {}).slice(0, 3).join(" \u00b7 ")}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {hasSyncedData && (
                  <div className="flex items-start justify-between py-3 border-b border-black/[0.04]">
                    <div className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-mono text-foreground">Segmented {stats?.totalCustomers ?? 0} customers into {(segmentDist?.length ?? 0)} groups</p>
                        <p className="text-[11px] text-muted-foreground font-sans mt-0.5">
                          {segmentDist?.slice(0, 3).map((s) => `${s.segment} (${s.customerCount})`).join(", ")}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {hasSyncedData && (
                  <div className="flex items-start justify-between py-3">
                    <div className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-[#6B7A2F] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-mono text-foreground">Calculated RFM scores for {stats?.totalCustomers ?? 0} customers</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer summary */}
              {tokenUsage && tokenUsage.totalCalls > 0 && (
                <div className="mt-4 pt-4 border-t border-black/[0.06] flex items-center gap-3">
                  <span className="text-[12px] font-mono text-muted-foreground">
                    {aiCalls} actions &middot; ${aiCost < 0.01 ? "<0.01" : aiCost.toFixed(2)} AI cost
                  </span>
                  {estimatedSavings > 0 && (
                    <span className="text-[12px] font-mono text-[#6B7A2F] font-semibold">
                      &middot; ~${estimatedSavings.toLocaleString()} in manual work saved
                    </span>
                  )}
                </div>
              )}
            </motion.div>

            {/* AUTOMATION STATUS */}
            <motion.div variants={itemVariants} className="glass-card-static p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-header accent-bar-left text-[13px] text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  AUTOMATIONS
                </h2>
                <Link href="/automations" className="text-[11px] font-mono text-terracotta hover:text-terracotta/80 transition-colors">
                  View all &rarr;
                </Link>
              </div>

              {programs && programs.length > 0 ? (
                <div className="space-y-0">
                  {programs.map((p, i) => (
                    <Link
                      key={p.id}
                      href="/automations"
                      className={`flex items-center justify-between py-2.5 hover:bg-white/10 -mx-2 px-2 rounded-lg transition-colors ${
                        i < programs.length - 1 ? "border-b border-black/[0.03]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          p.status === "active" ? "bg-[#6B7A2F]" :
                          p.status === "ready" ? "bg-[#B8963E]" :
                          p.status === "generating" ? "bg-[#C4704A] animate-pulse" :
                          p.status === "draft" ? "bg-[#C4704A]" :
                          "border border-muted-foreground"
                        }`} />
                        <span className="text-[12px] font-mono text-foreground truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-mono text-muted-foreground capitalize">{p.status}</span>
                        {p.status === "ready" && (
                          <span className="text-[10px] font-mono text-terracotta">Go Live &rarr;</span>
                        )}
                      </div>
                    </Link>
                  ))}
                  {/* Footer summary */}
                  <div className="pt-3 mt-1 border-t border-black/[0.04]">
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {programs.filter((p) => p.status === "active").length} live
                      {" \u00b7 "}{programs.filter((p) => p.status === "ready").length} ready
                      {" \u00b7 "}{programs.filter((p) => p.status === "draft" || p.status === "generating").length} draft
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-[12px] text-muted-foreground font-sans">No automations yet</p>
                  <Link href="/automations" className="text-[12px] font-mono text-terracotta mt-2 inline-block">
                    Generate automations &rarr;
                  </Link>
                </div>
              )}
            </motion.div>
          </div>

          {/* CUSTOMER HEALTH SNAPSHOT */}
          <motion.div variants={itemVariants} className="glass-card-static p-6">
            <h2 className="section-header accent-bar-left text-[13px] text-foreground mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              CUSTOMER HEALTH
            </h2>

            {segmentDist && segmentDist.length > 0 ? (
              <>
                {/* Stacked horizontal bar */}
                <div className="h-3 rounded-full overflow-hidden flex mb-3">
                  {segmentDist.map((s) => {
                    const totalCust = segmentDist.reduce((sum, seg) => sum + seg.customerCount, 0);
                    const pct = totalCust > 0 ? (s.customerCount / totalCust) * 100 : 0;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={s.segment}
                        style={{ width: `${pct}%`, backgroundColor: SEGMENT_COLORS[s.segment] ?? "#ccc" }}
                        title={`${s.segment}: ${s.customerCount} (${Math.round(pct)}%)`}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-4">
                  {segmentDist.filter((s) => s.customerCount > 0).map((s) => {
                    const totalCust = segmentDist.reduce((sum, seg) => sum + seg.customerCount, 0);
                    const pct = totalCust > 0 ? Math.round((s.customerCount / totalCust) * 100) : 0;
                    return (
                      <div key={s.segment} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: SEGMENT_COLORS[s.segment] ?? "#ccc" }} />
                        <span className="text-[11px] font-mono text-foreground">{s.segment}</span>
                        <span className="text-[10px] text-muted-foreground">{s.customerCount} ({pct}%)</span>
                        <span className="text-[10px] text-muted-foreground">${Math.round(s.totalRevenue).toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Key metrics */}
                {customerStats && (
                  <div className="flex items-center gap-6 mb-4 text-[11px] font-mono text-muted-foreground">
                    <span>Marketing opt-in: <strong className="text-foreground">{customerStats.marketingRate.toFixed(0)}%</strong></span>
                    <span>Avg order value: <strong className="text-foreground">${customerStats.avgOrderValue.toFixed(0)}</strong></span>
                  </div>
                )}

                {/* AI insight if hibernating segment is large */}
                {(() => {
                  const hibernating = segmentDist.find((s) => s.segment === "Lost" || s.segment === "Hibernating");
                  const totalCust = segmentDist.reduce((sum, s) => sum + s.customerCount, 0);
                  if (hibernating && totalCust > 0 && (hibernating.customerCount / totalCust) > 0.3) {
                    const pct = Math.round((hibernating.customerCount / totalCust) * 100);
                    return (
                      <div className="flex items-start gap-2 p-3 bg-white/20 rounded-lg border border-white/15">
                        <Sparkles className="w-3.5 h-3.5 text-[#B8963E] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[12px] font-sans text-foreground">
                            {pct}% of your base is dormant. A win-back campaign could recover estimated revenue.
                          </p>
                          <Link href="/automations" className="text-[11px] font-mono text-terracotta mt-1 inline-block">
                            Launch Win-Back &rarr;
                          </Link>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground font-sans py-4">
                Run RFM analysis to see customer health distribution.
              </p>
            )}
          </motion.div>
        </>
      )}

      {/* Recent activity — feed style */}
      <motion.div variants={itemVariants} className="glass-card-static overflow-hidden">
        <div className="px-6 py-4 border-b border-white/15 flex items-center gap-3">
          <h2 className="section-header accent-bar-left text-[13px] text-foreground">
            RECENT ACTIVITY
          </h2>
        </div>
        {statsLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 glass-skeleton" />
            ))}
          </div>
        ) : stats?.recentOrders && stats.recentOrders.length > 0 ? (
          <div className="divide-y divide-white/10">
            {stats.recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/10 transition-colors"
              >
                {/* Left color bar */}
                <div className="w-1 h-8 rounded-full bg-olive flex-shrink-0" />

                {/* Order info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-mono font-bold text-foreground">
                      #{order.orderNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20 border border-white/15 text-foreground">
                      {order.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-sans text-muted-foreground mt-0.5">
                    {order.customerName} · {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Amount */}
                <div className="text-right flex-shrink-0">
                  <span className="text-[15px] font-mono font-bold text-foreground tabular-nums">
                    ${order.totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center">
            <ShoppingBag className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground font-sans">No orders yet</p>
            <p className="text-[11px] text-muted-foreground/50 font-sans mt-1">
              Connect a store and sync data to see activity
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
