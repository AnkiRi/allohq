"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Store, User, Bell, CreditCard, Sparkles, Cpu, Check, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const TIER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  premium: { bg: "bg-purple-50", text: "text-purple-700", label: "Premium" },
  standard: { bg: "bg-blue-50", text: "text-blue-700", label: "Standard" },
  economy: { bg: "bg-green-50", text: "text-green-700", label: "Economy" },
};

const TOKEN_PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "180d", label: "180 Days" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All Time" },
] as const;

const MODEL_LABELS: Record<string, string> = {
  "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function getCostComparison(cost: number): string {
  if (cost === 0) return "No spend yet — your AI budget is untouched";
  if (cost < 0.01) return "Barely a rounding error";
  if (cost < 0.10) return "Less than a gumball";
  if (cost < 1.00) return "Less than the cost of a coffee";
  if (cost < 5.00) return "About the cost of a fancy latte";
  if (cost < 20.00) return "Less than a nice lunch";
  return "Serious AI power at work";
}

function TokenUsageSection() {
  const [period, setPeriod] = useState<string>("30d");

  const { data: usage, isLoading } = (trpc.dashboard as any).tokenUsage.useQuery(
    { period },
  ) as { data: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCalls: number;
    totalCost: number;
    byModel: { model: string; inputTokens: number; outputTokens: number; calls: number; cost: number }[];
  } | undefined; isLoading: boolean };

  return (
    <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <h2 className="section-header accent-bar-left text-[13px]">TOKEN USAGE</h2>
      </div>

      {/* Human-readable summary */}
      {usage && (
        <div className="mb-5">
          <p className="text-[20px] tracking-[-0.5px] font-bold text-foreground font-mono">
            You've spent ${usage.totalCost.toFixed(4)} on AI this period
          </p>
          <p className="text-[12px] text-muted-foreground font-sans mt-1">
            {getCostComparison(usage.totalCost)}
          </p>
        </div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {TOKEN_PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-mono transition-colors ${
              period === p.value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : usage ? (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: "Total Cost", value: `$${usage.totalCost.toFixed(4)}` },
              { label: "API Calls", value: String(usage.totalCalls) },
              { label: "Input Tokens", value: formatTokens(usage.totalInputTokens) },
              { label: "Output Tokens", value: formatTokens(usage.totalOutputTokens) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-white/30 border border-white/20 p-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </div>
                <div className="font-mono text-[16px] font-bold text-foreground mt-0.5">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Per-model breakdown */}
          {usage.byModel.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">By Model</p>
              {usage.byModel.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between p-3 bg-white/20 border border-white/15 rounded-lg"
                >
                  <div>
                    <p className="text-[12px] font-bold text-foreground font-mono">
                      {MODEL_LABELS[m.model] ?? m.model}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {m.calls} calls · {formatTokens(m.inputTokens)} in · {formatTokens(m.outputTokens)} out
                    </p>
                  </div>
                  <span className="text-[13px] font-bold font-mono text-foreground">
                    ${m.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-[11px] text-muted-foreground font-mono">
                No token usage in this period
              </p>
            </div>
          )}
        </>
      ) : null}
    </motion.div>
  );
}

export default function SettingsPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: stores, isLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const { data: brandStatus } = (trpc.ai.brandProfileStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { exists: boolean; creativeIntensity?: string } | undefined };

  const updateIntensityMut = (trpc.ai.updateCreativeIntensity as any).useMutation({
    onSuccess: () => {
      toast("Creative intensity updated!", "success");
      (utils.ai as any).brandProfileStatus.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Failed to update", "error"),
  }) as { mutate: (input: { storeId: string; creativeIntensity: string }) => void; isPending: boolean };

  // AI model settings
  const { data: models } = trpc.ai.models.useQuery();
  const { data: aiSettings } = (trpc.ai.getSettings as any).useQuery() as {
    data: { defaultModel: string | null } | undefined;
  };
  const setDefaultModel = (trpc.ai.setDefaultModel as any).useMutation({
    onSuccess: () => {
      toast("Default model updated!", "success");
      (utils.ai as any).getSettings.invalidate();
    },
    onError: (err: { message?: string }) => toast(err.message || "Failed to update", "error"),
  }) as { mutate: (input: { model: string | null }) => void; isPending: boolean };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-bold text-foreground">
          SETTINGS
        </h1>
        <p className="text-[13px] text-muted-foreground font-sans mt-1">
          Manage your workspace and account settings
        </p>
      </motion.div>

      {/* Profile */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">PROFILE</h2>
        </div>
        <div className="flex items-center gap-4">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="w-14 h-14 rounded-full" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-[18px] tracking-[-0.5px] font-bold text-secondary-foreground font-mono">
              {(user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress?.[0] || "U").toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-[13px] font-bold text-foreground font-mono">
              {user?.fullName || "User"}
            </p>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {user?.emailAddresses[0]?.emailAddress || ""}
            </p>
            <p className="text-[11px] text-muted-foreground/50 font-mono mt-0.5">
              Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Connected Stores */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Store className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">CONNECTED STORES</h2>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 glass-skeleton rounded" />
            ))}
          </div>
        ) : stores && stores.length > 0 ? (
          <div className="space-y-3">
            {stores.map((store) => (
              <div
                key={store.id}
                className="flex items-center justify-between p-4 bg-white/20 border border-white/15 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#96BF48] flex items-center justify-center">
                    <Store className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-foreground font-mono">
                      {store.shopDomain}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {store.platform} · {store._count.products} products · {store._count.customers} customers
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-green-50 text-green-600">
                  Active
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground font-mono">
            No stores connected. Go to Integrations to connect a store.
          </p>
        )}
      </motion.div>

      {/* AI Preferences */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">AI PREFERENCES</h2>
        </div>
        {brandStatus?.exists ? (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] text-muted-foreground font-mono mb-3">CREATIVE INTENSITY</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: "text_heavy", label: "Text Heavy", desc: "Copy-focused, minimal visuals" },
                  { value: "balanced", label: "Balanced", desc: "Mix of visuals and copy" },
                  { value: "visual_heavy", label: "Visual Heavy", desc: "Maximum visual impact" },
                ] as const).map((opt) => {
                  const current = brandStatus?.creativeIntensity ?? "balanced";
                  return (
                    <button
                      key={opt.value}
                      onClick={() => storeId && updateIntensityMut.mutate({ storeId, creativeIntensity: opt.value })}
                      disabled={updateIntensityMut.isPending}
                      className={`text-left p-4 rounded-xl transition-all ${
                        current === opt.value
                          ? "border border-[var(--terracotta)] shadow-[0_0_0_1px_var(--terracotta)] bg-white/30"
                          : "border border-white/20 bg-white/20 hover:border-white/40"
                      }`}
                    >
                      <p className="text-[11px] font-bold text-foreground font-mono">{opt.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-1">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Sparkles className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground font-mono">
              Run brand analysis first to unlock AI preferences
            </p>
          </div>
        )}
      </motion.div>

      {/* Default AI Model */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <h2 className="section-header accent-bar-left text-[13px]">DEFAULT AI MODEL</h2>
        </div>
        <p className="text-[11px] text-muted-foreground font-mono mb-4">
          Choose which model is used by default for all AI content generation
        </p>
        {models && models.length > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {models.map((model) => {
              const isSelected = aiSettings?.defaultModel === model.id;
              const tier = TIER_COLORS[(model as any).tier as string] ?? TIER_COLORS["standard"]!;
              return (
                <button
                  key={model.id}
                  onClick={() => setDefaultModel.mutate({ model: isSelected ? null : model.id })}
                  disabled={setDefaultModel.isPending || !model.available}
                  className={`relative text-left p-4 rounded-xl transition-all ${
                    isSelected
                      ? "glass-card-static shadow-[0_0_0_2px_var(--terracotta)]"
                      : model.available
                        ? "glass-card-static border-white/20 hover:border-white/40"
                        : "glass-card-static opacity-50 cursor-not-allowed"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--olive)" }}>
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[11px] font-bold text-foreground font-mono">{model.label}</p>
                    <span className="text-[9px] font-mono text-muted-foreground">{model.provider}</span>
                  </div>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${tier.bg} ${tier.text} mb-2`}>
                    {tier.label}
                  </span>
                  <p className="text-[10px] text-muted-foreground font-mono mb-3">{model.description}</p>
                  <div className="text-[10px] font-mono text-muted-foreground space-y-0.5">
                    <p>Input: ${(model as any).inputCostPerMillion}/M tokens</p>
                    <p>Output: ${(model as any).outputCostPerMillion}/M tokens</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 glass-skeleton rounded-xl" />
            ))}
          </div>
        )}
        {aiSettings?.defaultModel === null && models && (
          <p className="text-[10px] text-muted-foreground/50 font-mono mt-3">
            No default selected — AI will use Claude Sonnet 4.5
          </p>
        )}
      </motion.div>

      {/* Token Usage */}
      <TokenUsageSection />

      {/* Coming Soon sections */}
      {[
        {
          icon: Bell,
          title: "NOTIFICATIONS",
          description: "Email and in-app notification preferences are coming in our next update.",
        },
        {
          icon: CreditCard,
          title: "BILLING",
          description: "Subscription management and payment methods are coming in our next update.",
        },
      ].map((section) => (
        <motion.div key={section.title} variants={itemVariants} className="glass-card-static rounded-xl p-6 opacity-80">
          <div className="flex items-center gap-3 mb-4">
            <section.icon className="w-4 h-4 text-muted-foreground" />
            <h2 className="section-header accent-bar-left text-[13px]">{section.title}</h2>
          </div>
          <div className="py-6">
            <p className="text-[12px] text-muted-foreground font-sans leading-relaxed">
              {section.description}
            </p>
            <p className="text-[11px] font-mono mt-3" style={{ color: "var(--terracotta)" }}>
              We'll notify you when this is available
            </p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
