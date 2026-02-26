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
  Rocket,
  Bot,
  Circle,
  Cpu,
  SlidersHorizontal,
} from "lucide-react";
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
      <div className="border border-border bg-card rounded-lg p-4 space-y-3">
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
                    ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] bg-muted"
                    : model.available
                      ? "border-border hover:border-primary/50"
                      : "border-border opacity-40 cursor-not-allowed"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-secondary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-secondary-foreground" />
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
      <div className="border border-border bg-card rounded-lg p-4 space-y-3">
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
                    ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] bg-muted"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-secondary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-secondary-foreground" />
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
    <div className="border border-border rounded-xl bg-card px-6 py-4">
      <p className="text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-[1px] mb-3">
        YOUR AI CONFIGURATION
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
          <Cpu className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] font-mono text-foreground font-semibold">{modelLabel}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg">
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
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-blue-800 mb-1">
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
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
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin flex-shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                )}
                <span
                  className={`text-[11px] font-mono ${
                    isDone
                      ? "text-green-700"
                      : isCurrent
                        ? "text-blue-800 font-bold"
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
          <p className="text-[11px] font-mono text-blue-600 leading-relaxed">
            {progress.message}
          </p>
        )}

        {/* Progress bar */}
        {total > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-blue-600">
              <span>
                {done}/{total} programs
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
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
      <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-green-600 mb-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-bold">
            {run.programsDone} program{run.programsDone !== 1 ? "s" : ""} ready
            for review!
          </span>
        </div>

        <div className="flex items-start justify-between">
          <p className="text-xs font-mono text-green-700">
            AI agent has generated emails, SMS, WhatsApp, RCS messages, and workflows.
            Review the content and activate when you&apos;re ready.
          </p>
          <Link
            href="/automations"
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-green-200 rounded-lg text-[10px] font-mono text-green-700 hover:border-green-400 transition-all whitespace-nowrap flex-shrink-0 ml-3"
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
                className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-green-200 rounded-lg"
              >
                <Sparkles className="w-3 h-3 text-green-600 flex-shrink-0" />
                <span className="text-[11px] font-mono text-green-800 truncate flex-1">
                  {program.name}
                </span>
                <span className="px-1.5 py-0.5 rounded border text-[9px] font-mono whitespace-nowrap bg-green-50 text-green-600 border-green-100">
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
      <div className="flex items-center gap-2 text-xs font-mono text-green-600">
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 bg-green-50"
          >
            <item.icon className="w-3.5 h-3.5 text-green-600" />
            <div>
              <div className="text-sm font-mono font-bold text-green-700 tabular-nums">
                {item.value.toLocaleString()}
              </div>
              <div className="text-[10px] font-mono text-green-600 uppercase">
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted animate-pulse"
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
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
          <span className="text-xs font-mono font-bold text-blue-800">
            Analyzing your brand...
          </span>
        </div>
        <p className="text-[11px] font-mono text-blue-600 leading-relaxed">
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
      <div className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-mono text-green-600 mb-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="font-bold">Brand analysis complete!</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-mono font-bold text-green-800">
              {profile.brandName}
            </p>
            <p className="text-xs font-mono text-green-700 mt-0.5 line-clamp-2">
              {profile.brandDescription}
            </p>
          </div>
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-1 px-2.5 py-1 bg-white border border-green-200 rounded-lg text-[10px] font-mono text-green-700 hover:border-green-400 transition-all whitespace-nowrap flex-shrink-0"
          >
            View Details
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {tone && (
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 text-green-600" />
              <div className="flex gap-1 flex-wrap">
                {Object.entries(tone)
                  .slice(0, 3)
                  .map(([key, val]) => (
                    <span
                      key={key}
                      className="px-1.5 py-0.5 bg-white border border-green-200 rounded text-[10px] font-mono text-green-700"
                    >
                      {key}: {val}
                    </span>
                  ))}
              </div>
            </div>
          )}
          {colors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Palette className="w-3 h-3 text-green-600" />
              <div className="flex gap-1">
                {colors.slice(0, 4).map((color: string, i: number) => (
                  <div
                    key={i}
                    className="w-5 h-5 rounded-full border border-green-200"
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
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[13px] font-bold text-foreground font-mono">
              GET_STARTED
            </h2>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Complete these steps to unlock the full power of AlloHQ
            </p>
          </div>
          <span className="text-[12px] font-mono text-muted-foreground">
            {completedCount}/{steps.length} complete
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-secondary rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="divide-y divide-border">
        {steps.map((step, i) => {
          const isNext = step === nextStep;
          // Model step: editable until locked (brand analysis started), but only after sync is done
          const priorStepsDone = steps.slice(0, i).every((s) => s.done);
          const isModelEditable = step.key === "model" && step.done && !modelLocked && priorStepsDone;
          const isCreativeEditable = step.key === "creative" && step.done && !creativeLocked && priorStepsDone;
          const showAsDone = step.done && !isModelEditable && !isCreativeEditable;

          return (
            <div key={step.key}>
              <div
                className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                  showAsDone ? "opacity-60" : isNext || isModelEditable || isCreativeEditable ? "bg-muted" : ""
                }`}
              >
                {/* Step indicator */}
                <div className="flex-shrink-0">
                  {showAsDone ? (
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-secondary-foreground" />
                    </div>
                  ) : isModelEditable || isCreativeEditable ? (
                    <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  ) : step.loading ? (
                    <div className="w-7 h-7 rounded-full border-2 border-secondary flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 text-foreground animate-spin" />
                    </div>
                  ) : isNext ? (
                    <div className="w-7 h-7 rounded-full border-2 border-secondary flex items-center justify-center">
                      <span className="text-xs font-mono font-bold text-foreground">
                        {i + 1}
                      </span>
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center">
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
                            ? "text-green-600"
                            : step.loading
                              ? "text-foreground"
                              : isNext
                                ? "text-foreground"
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
                  <p className="text-[11px] font-mono text-muted-foreground mt-0.5 ml-5.5">
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
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap animate-pulse">
                    Working...
                  </span>
                )}
                {!step.done && !step.loading && !isNext && (
                  <span className="text-[10px] font-mono text-muted-foreground/50 whitespace-nowrap">
                    Pending
                  </span>
                )}
                {(isModelEditable || isCreativeEditable) && (
                  <span className="text-[10px] font-mono text-green-600 whitespace-nowrap">
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

  useEffect(() => {
    if (!isSyncing || !store) return;
    if (store.lastSyncAt && store.lastSyncAt !== preSyncLastSyncAt) {
      setIsSyncing(false);
      setSyncDone(true);
      utils.stores.list.invalidate();
      utils.dashboard.stats.invalidate();
    }
  }, [isSyncing, store, preSyncLastSyncAt, utils]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-border rounded-xl p-8 bg-card">
        <h1 className="text-[22px] font-bold text-foreground font-mono tracking-[-0.5px] mb-1">
          DASHBOARD
        </h1>
        <p className="text-[13px] text-muted-foreground font-mono">
          AlloHQ — Marketing automation for e-commerce
        </p>
        <div className="mt-5 flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${
              healthLoading
                ? "bg-muted-foreground/50 animate-pulse"
                : health
                  ? "bg-secondary"
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
      </div>

      {/* Setup checklist */}
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

      {/* Selections summary — visible when agent is running or setup is complete */}
      {(isAgentRunning || allSetupDone) && aiSettings?.defaultModel && (
        <SelectionsSummary
          modelLabel={
            (aiModels as any)?.find((m: any) => m.id === aiSettings.defaultModel)?.label
            ?? aiSettings.defaultModel
          }
          creativeIntensity={currentCreativeIntensity}
        />
      )}

      {/* All done banner */}
      {allSetupDone && (
        <div className="border border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success-bg))] rounded-xl p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--success)/0.12)] flex items-center justify-center flex-shrink-0">
            <Rocket className="w-5 h-5 text-[hsl(var(--success))]" />
          </div>
          <div className="flex-1">
            <h3 className="text-[13px] font-bold text-[hsl(var(--success))] font-mono">
              You&apos;re all set!
            </h3>
            <p className="text-[11px] text-[hsl(var(--success)/0.7)] font-mono mt-0.5">
              Your store is connected, brand is analyzed, and automations are live.
              Head to the automations page to manage your retention strategy.
            </p>
          </div>
          <Link
            href="/automations"
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all whitespace-nowrap"
          >
            Go to Automations
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* Quick nav cards */}
      <div className="grid grid-cols-4 gap-4">
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
          <Link
            key={item.title}
            href={item.href}
            className="border border-border rounded-xl p-6 bg-card hover:border-foreground hover:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all duration-200 group"
          >
            <div className="flex items-start justify-between mb-4">
              <item.icon className="w-6 h-6 text-muted-foreground/50 group-hover:text-foreground transition-colors duration-200" />
              <ArrowUpRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground transition-colors duration-200" />
            </div>
            <h3 className="text-[12px] font-bold text-foreground font-mono mb-1">
              {item.title}
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono">
              {item.description}
            </p>
          </Link>
        ))}
      </div>

      {/* Stats */}
      {hasSyncedData && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "TOTAL CUSTOMERS",
              value: stats?.totalCustomers?.toLocaleString() ?? "0",
            },
            {
              label: "ACTIVE CAMPAIGNS",
              value: "—",
            },
            {
              label: "REVENUE THIS MONTH",
              value: `$${(stats?.revenueThisMonth ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="border border-border rounded-xl p-6 bg-card"
            >
              <div className="text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-[1px] mb-2">
                {stat.label}
              </div>
              {statsLoading ? (
                <div className="h-9 w-20 bg-muted rounded animate-pulse" />
              ) : (
                <div className="text-[28px] font-bold text-foreground font-mono tabular-nums">
                  {stat.value}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI Usage */}
      {tokenUsage && tokenUsage.totalCalls > 0 && (
        <div className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-5">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">AI_USAGE</h2>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="border border-border rounded-lg p-4">
              <div className="text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-[1px] mb-1">
                Total Tokens
              </div>
              <div className="text-[22px] font-bold text-foreground font-mono tabular-nums">
                {((tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens) / 1000).toFixed(1)}K
              </div>
            </div>
            <div className="border border-border rounded-lg p-4">
              <div className="text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-[1px] mb-1">
                Estimated Cost
              </div>
              <div className="text-[22px] font-bold text-foreground font-mono tabular-nums">
                ${tokenUsage.totalCost < 0.01 ? "<0.01" : tokenUsage.totalCost.toFixed(2)}
              </div>
            </div>
            <div className="border border-border rounded-lg p-4">
              <div className="text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-[1px] mb-1">
                AI Calls
              </div>
              <div className="text-[22px] font-bold text-foreground font-mono tabular-nums">
                {tokenUsage.totalCalls}
              </div>
            </div>
          </div>

          {/* Per-model breakdown */}
          {tokenUsage.byModel.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-[0.5px] mb-2">
                By Model
              </div>
              {tokenUsage.byModel.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between px-3 py-2 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-foreground">{m.model}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {m.calls} call{m.calls !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                      {((m.inputTokens + m.outputTokens) / 1000).toFixed(1)}K tokens
                    </span>
                    <span className="text-xs font-mono font-bold text-foreground tabular-nums">
                      ${m.cost < 0.01 ? "<0.01" : m.cost.toFixed(4)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent activity */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-px h-5 bg-secondary" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">
            RECENT_ACTIVITY
          </h2>
        </div>
        {statsLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : stats?.recentOrders && stats.recentOrders.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-[0.5px]">
                  Order
                </th>
                <th className="text-left px-6 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-[0.5px]">
                  Customer
                </th>
                <th className="text-left px-6 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-[0.5px]">
                  Status
                </th>
                <th className="text-right px-6 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-[0.5px]">
                  Total
                </th>
                <th className="text-right px-6 py-3 text-[10px] font-mono text-muted-foreground uppercase tracking-[0.5px]">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.recentOrders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-muted transition-colors"
                >
                  <td className="px-6 py-3 text-[13px] font-mono font-bold text-foreground">
                    #{order.orderNumber}
                  </td>
                  <td className="px-6 py-3 text-[13px] font-mono text-foreground">
                    {order.customerName}
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-mono bg-muted text-foreground">
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-[13px] font-mono font-bold text-foreground tabular-nums">
                    ${order.totalPrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right text-[11px] font-mono text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-10 text-center">
            <ShoppingBag className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground font-mono">No orders yet</p>
            <p className="text-[11px] text-muted-foreground/50 font-mono mt-1">
              Connect a store and sync data to see activity
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
