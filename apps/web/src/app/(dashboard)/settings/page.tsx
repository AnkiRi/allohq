"use client";

import { useUser } from "@clerk/nextjs";
import { Settings, Store, User, Bell, CreditCard, Sparkles, Cpu, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

const TIER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  premium: { bg: "bg-purple-50", text: "text-purple-700", label: "Premium" },
  standard: { bg: "bg-blue-50", text: "text-blue-700", label: "Standard" },
  economy: { bg: "bg-green-50", text: "text-green-700", label: "Economy" },
};

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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
          SETTINGS
        </h1>
        <p className="text-[13px] text-muted-foreground font-mono mt-1">
          Manage your workspace and account settings
        </p>
      </div>

      {/* Profile */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">PROFILE</h2>
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
      </div>

      {/* Connected Stores */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3 mb-6">
          <Store className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">CONNECTED STORES</h2>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : stores && stores.length > 0 ? (
          <div className="space-y-3">
            {stores.map((store) => (
              <div
                key={store.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg"
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
      </div>

      {/* AI Preferences */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">AI PREFERENCES</h2>
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
                      className={`text-left p-4 border rounded-xl transition-all ${
                        current === opt.value
                          ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] bg-muted"
                          : "border-border hover:border-primary/50"
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
      </div>

      {/* Default AI Model */}
      <div className="border border-border rounded-xl p-6 bg-card">
        <div className="flex items-center gap-3 mb-6">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-[13px] font-bold text-foreground font-mono">DEFAULT AI MODEL</h2>
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
                  className={`relative text-left p-4 border rounded-xl transition-all ${
                    isSelected
                      ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))] bg-muted"
                      : model.available
                        ? "border-border hover:border-primary/50"
                        : "border-border opacity-50 cursor-not-allowed"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                      <Check className="w-3 h-3 text-secondary-foreground" />
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
              <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        )}
        {aiSettings?.defaultModel === null && models && (
          <p className="text-[10px] text-muted-foreground/50 font-mono mt-3">
            No default selected — AI will use Claude Sonnet 4.5
          </p>
        )}
      </div>

      {/* Placeholder sections */}
      {[
        {
          icon: Bell,
          title: "NOTIFICATIONS",
          description: "Configure email and in-app notification preferences",
        },
        {
          icon: CreditCard,
          title: "BILLING",
          description: "Manage your subscription and payment methods",
        },
      ].map((section) => (
        <div key={section.title} className="border border-border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-3 mb-4">
            <section.icon className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-bold text-foreground font-mono">{section.title}</h2>
          </div>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Settings className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[11px] text-muted-foreground font-mono">{section.description}</p>
              <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">Coming soon</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
