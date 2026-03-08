"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Palette,
  Shield,
  ShieldCheck,
  BarChart3,
  Zap,
  Check,
  ChevronRight,
  Loader2,
} from "lucide-react";
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

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  icon: typeof RefreshCw;
  status: "pending" | "in_progress" | "done";
}

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);

  const { data: stores } = trpc.stores.list.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const store = stores?.[0];
  const storeId = store?.id ?? "";

  // Check sync status
  const hasSynced = !!store?.lastSyncAt;

  // Check brand profile
  const { data: brandProfile } = (trpc as any).stores.brandProfile?.useQuery?.(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any | undefined } ?? { data: undefined };

  // Check autonomy configs
  const { data: autonomyConfigs } = (trpc as any).autonomy.getConfig.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any[] | undefined };

  // Check guardrails
  const { data: guardrails } = (trpc as any).guardrails.list.useQuery(
    { storeId },
    { enabled: !!storeId },
  ) as { data: any[] | undefined };

  // Check store report
  const { data: storeReport } = (trpc as any).briefings.storeReport.useQuery(
    { storeId },
    { enabled: !!storeId && currentStep >= 4 },
  ) as { data: any | undefined };

  // Check pending actions
  const { data: pendingActions } = (trpc as any).autonomy.listActions.useQuery(
    { storeId, status: "pending", limit: 5 },
    { enabled: !!storeId && currentStep >= 5 },
  ) as { data: { actions: any[]; total: number } | undefined };

  // Initialize autonomy defaults
  const initDefaults = (trpc as any).autonomy.initializeDefaults.useMutation({
    onSuccess: () => toast("Autonomy defaults applied!", "success"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  // Compute step statuses
  const steps: OnboardingStep[] = [
    {
      key: "sync",
      label: "Syncing your store",
      description: "Importing products, customers, orders, and collections from Shopify",
      icon: RefreshCw,
      status: hasSynced ? "done" : "in_progress",
    },
    {
      key: "brand",
      label: "Brand review",
      description: "Review your extracted brand colors, fonts, and aesthetic",
      icon: Palette,
      status: brandProfile ? "done" : currentStep >= 1 ? "in_progress" : "pending",
    },
    {
      key: "autonomy",
      label: "Autonomy configuration",
      description: "Choose how much control Allo has per action category",
      icon: Shield,
      status: (autonomyConfigs?.length ?? 0) > 0 ? "done" : currentStep >= 2 ? "in_progress" : "pending",
    },
    {
      key: "guardrails",
      label: "Guardrails setup",
      description: "Set max discount, send frequency, quiet hours, and spending caps",
      icon: ShieldCheck,
      status: (guardrails?.length ?? 0) > 0 ? "done" : currentStep >= 3 ? "in_progress" : "pending",
    },
    {
      key: "report",
      label: "Store Intelligence Report",
      description: "Here's what we found about your store and customers",
      icon: BarChart3,
      status: storeReport ? "done" : currentStep >= 4 ? "in_progress" : "pending",
    },
    {
      key: "actions",
      label: "First actions",
      description: "Here are things Allo can do right now — approve with one click",
      icon: Zap,
      status: currentStep >= 6 ? "done" : currentStep >= 5 ? "in_progress" : "pending",
    },
  ];

  // Auto-advance from sync step when data is ready
  useEffect(() => {
    if (currentStep === 0 && hasSynced) {
      setCurrentStep(1);
    }
  }, [hasSynced, currentStep]);

  const handleNext = () => {
    if (currentStep === 2 && (autonomyConfigs?.length ?? 0) === 0) {
      // Initialize defaults if none set
      initDefaults.mutate({ storeId });
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleFinish = () => {
    router.push("/dashboard");
  };

  const handleStepAction = (stepKey: string) => {
    switch (stepKey) {
      case "brand":
        router.push("/onboarding/brand-review");
        break;
      case "autonomy":
        router.push("/settings/autonomy");
        break;
      case "guardrails":
        router.push("/settings/guardrails");
        break;
      case "actions":
        router.push("/actions");
        break;
    }
  };

  const isLastStep = currentStep === steps.length - 1;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl mx-auto space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="text-center py-8">
        <h1 className="text-[28px] font-bold text-[#2C2C2C] tracking-tight">
          Welcome to Allo
        </h1>
        <p className="text-sm text-[#8B8074] mt-2">
          We&apos;re setting up your autonomous relationship platform
        </p>
      </motion.div>

      {/* Progress bar */}
      <motion.div variants={itemVariants} className="glass-card-static rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-[#8B8074]">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-xs text-[#8B8074]">
            {steps.filter((s) => s.status === "done").length}/{steps.length} complete
          </span>
        </div>
        <div className="w-full h-1.5 bg-[#EDE7DB] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-[#6B7A2F] rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </motion.div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const isDone = step.status === "done";
          const isPast = i < currentStep;

          return (
            <motion.div
              key={step.key}
              variants={itemVariants}
              className={`glass-card-static rounded-xl p-5 transition-all ${
                isActive
                  ? "ring-2 ring-[#6B7A2F]/30"
                  : isDone || isPast
                  ? "opacity-70"
                  : "opacity-40"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    isDone
                      ? "bg-[#6B7A2F] text-white"
                      : isActive
                      ? "bg-[#EDE7DB] text-[#2C2C2C]"
                      : "bg-[#EDE7DB]/50 text-[#8B8074]"
                  }`}
                >
                  {isDone ? (
                    <Check className="w-5 h-5" />
                  ) : isActive && step.key === "sync" && !hasSynced ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-sm font-semibold ${
                      isDone ? "text-[#6B7A2F]" : "text-[#2C2C2C]"
                    }`}
                  >
                    {step.label}
                  </h3>
                  <p className="text-xs text-[#8B8074] mt-0.5">{step.description}</p>

                  {/* Active step content */}
                  {isActive && step.key === "report" && storeReport && (
                    <div className="mt-3 p-3 bg-white/40 rounded-lg text-xs text-[#5C5549] space-y-1">
                      <p>Total customers: {storeReport.customerInsights?.totalCustomers?.toLocaleString()}</p>
                      <p>At-risk customers: {storeReport.customerInsights?.churnRiskCount}</p>
                      <p>VIP customers: {storeReport.customerInsights?.vipCount}</p>
                      {storeReport.recommendations?.slice(0, 2).map((rec: string, ri: number) => (
                        <p key={ri} className="text-[#6B7A2F]">Recommendation: {rec}</p>
                      ))}
                    </div>
                  )}

                  {isActive && step.key === "actions" && pendingActions && (
                    <div className="mt-3 space-y-1">
                      {pendingActions.actions.slice(0, 3).map((action: any) => (
                        <div key={action.id} className="p-2 bg-white/40 rounded-lg text-xs text-[#5C5549]">
                          {action.reasoning?.substring(0, 100)}
                        </div>
                      ))}
                      {pendingActions.total > 3 && (
                        <p className="text-xs text-[#8B8074]">+{pendingActions.total - 3} more actions</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Action button for active step */}
                {isActive && step.key !== "sync" && (
                  <button
                    onClick={() => handleStepAction(step.key)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[#EDE7DB] text-[#2C2C2C] hover:bg-[#E0D7C8] transition-colors shrink-0"
                  >
                    Configure
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Navigation */}
      <motion.div variants={itemVariants} className="flex items-center justify-between pt-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-xs text-[#8B8074] hover:text-[#5C5549] transition-colors"
        >
          Skip onboarding
        </button>
        <button
          onClick={isLastStep ? handleFinish : handleNext}
          className="flex items-center gap-1 px-5 py-2.5 bg-[#2C2C2C] text-white text-sm rounded-lg hover:bg-[#1a1a1a] transition-colors"
        >
          {isLastStep ? "Go to Dashboard" : "Next"}
          <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    </motion.div>
  );
}
