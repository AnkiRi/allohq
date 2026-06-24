"use client";

import { Shield, Zap, Eye, Bot } from "lucide-react";
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

const TIERS = [
  { value: "autopilot", label: "Autopilot", icon: Zap, desc: "allo acts on its own when it's confident" },
  { value: "copilot", label: "Copilot", icon: Eye, desc: "allo drafts, you approve before it goes out" },
  { value: "advisor", label: "Advisor", icon: Bot, desc: "allo suggests, you make every call" },
] as const;

const CATEGORIES = [
  { value: "cart_recovery", label: "Cart Recovery", desc: "Abandoned cart follow-ups" },
  { value: "win_back", label: "Win Back", desc: "Re-engage churning customers" },
  { value: "post_purchase", label: "Post Purchase", desc: "Thank you, review requests" },
  { value: "repurchase", label: "Repurchase", desc: "Reorder reminders" },
  { value: "welcome", label: "Welcome", desc: "New subscriber onboarding" },
  { value: "promotional", label: "Promotional", desc: "Sales, offers, announcements" },
  { value: "vip", label: "VIP", desc: "Exclusive loyalty programs" },
  { value: "cross_sell", label: "Cross Sell", desc: "Product recommendations" },
  { value: "support", label: "Support", desc: "Customer service actions" },
] as const;

export default function AutonomySettingsPage() {
  const { toast } = useToast();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const { data: configs, isLoading } = (trpc as any).autonomy.getConfig.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: Array<{ category: string; tier: string; settings: Record<string, unknown> }> | undefined; isLoading: boolean };

  const utils = trpc.useUtils();
  const updateMut = (trpc as any).autonomy.updateConfig.useMutation({
    onSuccess: () => {
      toast("Autonomy updated.", "success");
      (utils as any).autonomy.getConfig.invalidate({ storeId });
    },
    onError: (err: { message?: string }) => toast(err.message || "Couldn't save that. Please try again.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const initMut = (trpc as any).autonomy.initializeDefaults.useMutation({
    onSuccess: () => {
      toast("Recommended settings applied.", "success");
      (utils as any).autonomy.getConfig.invalidate({ storeId });
    },
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const configMap = new Map((configs ?? []).map((c) => [c.category, c]));

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants}>
        <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
          Autonomy
        </h1>
        <p className="text-[13px] text-muted-foreground font-sans mt-1">
          Decide how much allo can do on its own for each kind of action
        </p>
      </motion.div>

      {!storeId ? (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6 text-center">
          <Shield className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-[11px] text-muted-foreground">Connect a store and allo can start helping here.</p>
        </motion.div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {(!configs || configs.length === 0) && (
            <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6 text-center">
              <p className="text-[11px] text-muted-foreground mb-3">
                You haven&apos;t set autonomy yet. allo will ask before doing anything until you do.
              </p>
              <button
                onClick={() => initMut.mutate({ storeId })}
                disabled={initMut.isPending}
                className="px-4 py-2 rounded-lg text-[11px] font-sans bg-foreground text-background hover:opacity-90 transition-opacity"
              >
                Use allo&apos;s recommendations
              </button>
            </motion.div>
          )}

          <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h2 className="section-header accent-bar-left text-[13px]">Autonomy by action</h2>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[1fr_repeat(3,120px)] gap-2 mb-3">
              <div />
              {TIERS.map((t) => (
                <div key={t.value} className="text-center">
                  <t.icon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-[10px] font-bold text-foreground">{t.label}</p>
                  <p className="text-[9px] text-muted-foreground">{t.desc}</p>
                </div>
              ))}
            </div>

            {/* Category rows */}
            <div className="space-y-2">
              {CATEGORIES.map((cat) => {
                const current = configMap.get(cat.value)?.tier ?? "copilot";
                return (
                  <div
                    key={cat.value}
                    className="grid grid-cols-[1fr_repeat(3,120px)] gap-2 items-center p-3 bg-white/10 rounded-lg"
                  >
                    <div>
                      <p className="text-[11px] font-bold text-foreground">{cat.label}</p>
                      <p className="text-[9px] text-muted-foreground">{cat.desc}</p>
                    </div>
                    {TIERS.map((t) => (
                      <button
                        key={t.value}
                        onClick={() =>
                          updateMut.mutate({ storeId, category: cat.value, tier: t.value })
                        }
                        disabled={updateMut.isPending}
                        className={`h-8 rounded-lg transition-all text-[10px] font-sans ${
                          current === t.value
                            ? "bg-foreground text-background shadow-sm"
                            : "bg-white/20 text-muted-foreground hover:bg-white/40"
                        }`}
                      >
                        {current === t.value ? "Active" : "Select"}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
