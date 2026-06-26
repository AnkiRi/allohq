"use client";

import { useState } from "react";
import { ShieldCheck, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
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

const RULE_TYPES = [
  { value: "max_discount", label: "Max Discount %", fields: [{ key: "maxPercent", label: "Maximum %", type: "number" as const }] },
  { value: "max_sends_per_week", label: "Max Sends/Week", fields: [{ key: "max", label: "Maximum sends", type: "number" as const }, { key: "channel", label: "Channel", type: "text" as const }] },
  { value: "blocked_words", label: "Blocked Words", fields: [{ key: "words", label: "Words (comma-separated)", type: "text" as const }] },
  { value: "quiet_hours", label: "Quiet Hours", fields: [{ key: "startHour", label: "Start hour (0-23)", type: "number" as const }, { key: "endHour", label: "End hour (0-23)", type: "number" as const }] },
  { value: "spending_cap", label: "Monthly Spending Cap", fields: [{ key: "maxMonthly", label: "Max monthly (₹)", type: "number" as const }] },
];

export default function GuardrailsPage() {
  const { toast } = useToast();
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const { data: guardrails, isLoading } = (trpc as any).guardrails.list.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: Array<{ id: string; ruleType: string; ruleValue: Record<string, unknown>; isActive: boolean; createdAt: string }> | undefined; isLoading: boolean };

  const utils = trpc.useUtils();

  const createMut = (trpc as any).guardrails.create.useMutation({
    onSuccess: () => {
      toast("Limit added. allo will respect it from now on.", "success");
      (utils as any).guardrails.list.invalidate({ storeId });
      setShowForm(false);
      setNewRule({ ruleType: "", values: {} });
    },
    onError: (err: { message?: string }) => toast(err.message || "Couldn't add that. Please try again.", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const updateMut = (trpc as any).guardrails.update.useMutation({
    onSuccess: () => {
      toast("Limit updated.", "success");
      (utils as any).guardrails.list.invalidate({ storeId });
    },
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const deleteMut = (trpc as any).guardrails.delete.useMutation({
    onSuccess: () => {
      toast("Limit removed.", "success");
      (utils as any).guardrails.list.invalidate({ storeId });
    },
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const [showForm, setShowForm] = useState(false);
  const [newRule, setNewRule] = useState<{ ruleType: string; values: Record<string, string> }>({
    ruleType: "",
    values: {},
  });

  const selectedRuleType = RULE_TYPES.find((r) => r.value === newRule.ruleType);

  const handleCreate = () => {
    if (!newRule.ruleType || !storeId) return;
    const ruleValue: Record<string, unknown> = {};
    for (const field of selectedRuleType?.fields ?? []) {
      const raw = newRule.values[field.key] ?? "";
      if (field.key === "words") {
        ruleValue[field.key] = raw.split(",").map((w) => w.trim()).filter(Boolean);
      } else if (field.type === "number") {
        ruleValue[field.key] = Number(raw);
      } else {
        ruleValue[field.key] = raw;
      }
    }
    createMut.mutate({ storeId, ruleType: newRule.ruleType, ruleValue });
  };

  const getRuleLabel = (type: string) => RULE_TYPES.find((r) => r.value === type)?.label ?? type;

  const formatRuleValue = (type: string, value: Record<string, unknown>) => {
    switch (type) {
      case "max_discount": return `Max ${value.maxPercent}%`;
      case "max_sends_per_week": return `Max ${value.max} per week${value.channel ? ` (${value.channel})` : ""}`;
      case "blocked_words": return `${(value.words as string[])?.length ?? 0} blocked words`;
      case "quiet_hours": return `${value.startHour}:00 - ${value.endHour}:00`;
      case "spending_cap": return `₹${value.maxMonthly}/month`;
      default: return JSON.stringify(value);
    }
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            Guardrails
          </h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            Set the limits allo always stays within
          </p>
        </div>
        {storeId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-sans bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" />
            Add limit
          </button>
        )}
      </motion.div>

      {/* New rule form */}
      {showForm && (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
          <h3 className="text-[12px] font-serif font-bold text-foreground mb-4">New limit</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-sans text-muted-foreground mb-1.5">Type of limit</label>
              <select
                value={newRule.ruleType}
                onChange={(e) => setNewRule({ ruleType: e.target.value, values: {} })}
                className="w-full p-2 rounded-lg bg-muted border border-border text-[11px] font-sans text-foreground"
              >
                <option value="">Choose a type of limit...</option>
                {RULE_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {selectedRuleType?.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-[10px] font-sans text-muted-foreground mb-1.5">{field.label}</label>
                <input
                  type={field.type}
                  value={newRule.values[field.key] ?? ""}
                  onChange={(e) => setNewRule((prev) => ({
                    ...prev,
                    values: { ...prev.values, [field.key]: e.target.value },
                  }))}
                  className="w-full p-2 rounded-lg bg-muted border border-border text-[11px] font-sans text-foreground"
                  placeholder={field.label}
                />
              </div>
            ))}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newRule.ruleType || createMut.isPending}
                className="px-4 py-2 rounded-lg text-[11px] font-sans bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createMut.isPending ? "Adding..." : "Add limit"}
              </button>
              <button
                onClick={() => { setShowForm(false); setNewRule({ ruleType: "", values: {} }); }}
                className="px-4 py-2 rounded-lg text-[11px] font-sans bg-muted text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Existing rules */}
      {!storeId ? (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6 text-center">
          <ShieldCheck className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-[11px] text-muted-foreground">Connect a store and you can set limits for allo here.</p>
        </motion.div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : guardrails && guardrails.length > 0 ? (
        <motion.div variants={itemVariants} className="space-y-2">
          {guardrails.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                rule.isActive
                  ? "glass-card-static"
                  : "bg-muted border border-border opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className={`w-4 h-4 ${rule.isActive ? "text-foreground" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-[11px] font-bold text-foreground">
                    {getRuleLabel(rule.ruleType)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatRuleValue(rule.ruleType, rule.ruleValue)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateMut.mutate({ id: rule.id, isActive: !rule.isActive })}
                  disabled={updateMut.isPending}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  title={rule.isActive ? "Disable" : "Enable"}
                >
                  {rule.isActive ? (
                    <ToggleRight className="w-5 h-5 text-green-600" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={() => deleteMut.mutate({ id: rule.id })}
                  disabled={deleteMut.isPending}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6 text-center">
          <ShieldCheck className="w-6 h-6 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-[11px] text-muted-foreground">
            No limits set yet. allo will ask before doing anything risky. Add a limit to set firm boundaries.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
