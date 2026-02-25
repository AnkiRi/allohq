"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Palette } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

type Step = "details" | "template" | "audience" | "schedule";

export default function NewCampaignPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [segmentId, setSegmentId] = useState<string | undefined>(undefined);
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: stores } = trpc.stores.list.useQuery();
  const { data: templates, isLoading: templatesLoading } = trpc.templates.list.useQuery(undefined) as {
    data: { id: string; name: string; subject: string }[] | undefined;
    isLoading: boolean;
  };
  const { data: segments, isLoading: segmentsLoading } = trpc.segments.list.useQuery(undefined) as {
    data: { id: string; name: string; description: string | null; customerCount: number }[] | undefined;
    isLoading: boolean;
  };
  const storeId = stores?.[0]?.id ?? "";

  const { data: brandStatus } = (trpc.ai.brandProfileStatus as any).useQuery(
    { storeId },
    { enabled: !!storeId }
  ) as { data: { exists: boolean } | undefined };
  const hasBrandProfile = brandStatus?.exists ?? false;

  const createMut = trpc.campaigns.create.useMutation();
  const sendMut = trpc.campaigns.sendNow.useMutation();

  const steps: { key: Step; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "template", label: "Template" },
    { key: "audience", label: "Audience" },
    { key: "schedule", label: "Send" },
  ];

  const currentIdx = steps.findIndex((s) => s.key === step);

  async function handleCreate() {
    if (!storeId || !templateId) return;
    const campaign = await createMut.mutateAsync({
      name: name || "Untitled Campaign",
      storeId,
      templateId,
      segmentId,
      scheduledAt: !sendNow && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });

    if (sendNow) {
      await sendMut.mutateAsync({ id: campaign.id });
      toast("Campaign created and sent!", "success");
    } else {
      toast("Campaign created!", "success");
    }

    router.push(`/campaigns/${campaign.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/campaigns" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 font-mono tracking-tight">NEW_CAMPAIGN</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <button
              onClick={() => i <= currentIdx && setStep(s.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                s.key === step
                  ? "bg-gray-900 text-white"
                  : i < currentIdx
                    ? "bg-gray-100 text-gray-900"
                    : "bg-white border border-gray-200 text-gray-400"
              }`}
            >
              {i < currentIdx && <Check className="w-3 h-3" />}
              {s.label}
            </button>
            {i < steps.length - 1 && <ArrowRight className="w-3 h-3 text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Brand analysis gate */}
      {storeId && !hasBrandProfile && (
        <div className="flex items-center gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl">
          <Palette className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-purple-900 font-mono">Set up your brand voice first</p>
            <p className="text-xs text-purple-600 font-mono mt-0.5">
              Brand analysis is required before creating campaigns. This helps AI create on-brand content.
            </p>
          </div>
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-xs font-mono hover:bg-purple-700 transition-all whitespace-nowrap"
          >
            <Palette className="w-3.5 h-3.5" />
            Set Up Brand
          </Link>
        </div>
      )}

      {/* Step content */}
      <div className="border border-gray-200 rounded-xl bg-white p-6">
        {step === "details" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900 font-mono">Campaign Details</h2>
            <div>
              <label className="block text-xs text-gray-400 font-mono mb-1">Campaign Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-gray-400"
                placeholder="e.g., Summer Sale 2026"
              />
            </div>
            <button
              onClick={() => setStep("template")}
              disabled={!name}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {step === "template" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900 font-mono">Select Template</h2>
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : templates && templates.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`text-left p-3 border rounded-lg transition-all ${
                      templateId === t.id
                        ? "border-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,1)]"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <p className="text-xs font-bold text-gray-900 font-mono truncate">{t.name}</p>
                    <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5">{t.subject}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 font-mono">
                No templates yet.{" "}
                <Link href="/templates/new" className="underline">
                  Create one
                </Link>
              </p>
            )}
            <button
              onClick={() => setStep("audience")}
              disabled={!templateId}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {step === "audience" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900 font-mono">Select Audience</h2>
            {segmentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : (
            <div className="space-y-2">
              <button
                onClick={() => setSegmentId(undefined)}
                className={`w-full text-left p-3 border rounded-lg transition-all ${
                  !segmentId ? "border-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,1)]" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <p className="text-xs font-bold text-gray-900 font-mono">All Subscribers</p>
                <p className="text-[10px] text-gray-400 font-mono">Send to all marketing-opted-in customers</p>
              </button>
              {segments?.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => setSegmentId(seg.id)}
                  className={`w-full text-left p-3 border rounded-lg transition-all ${
                    segmentId === seg.id ? "border-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,1)]" : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-900 font-mono">{seg.name}</p>
                    <span className="text-[10px] text-gray-400 font-mono">{seg.customerCount} customers</span>
                  </div>
                  {seg.description && <p className="text-[10px] text-gray-400 font-mono mt-0.5">{seg.description}</p>}
                </button>
              ))}
            </div>
            )}
            <button
              onClick={() => setStep("schedule")}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 transition-all"
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {step === "schedule" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-gray-900 font-mono">When to Send</h2>
            <div className="space-y-2">
              <button
                onClick={() => setSendNow(true)}
                className={`w-full text-left p-3 border rounded-lg transition-all ${
                  sendNow ? "border-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,1)]" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <p className="text-xs font-bold text-gray-900 font-mono">Send Now</p>
                <p className="text-[10px] text-gray-400 font-mono">Send immediately after creation</p>
              </button>
              <button
                onClick={() => setSendNow(false)}
                className={`w-full text-left p-3 border rounded-lg transition-all ${
                  !sendNow ? "border-gray-900 shadow-[0_0_0_1px_rgba(0,0,0,1)]" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <p className="text-xs font-bold text-gray-900 font-mono">Schedule</p>
                <p className="text-[10px] text-gray-400 font-mono">Pick a date and time</p>
              </button>
              {!sendNow && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-gray-400"
                />
              )}
            </div>
            <button
              onClick={handleCreate}
              disabled={createMut.isPending || sendMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 disabled:opacity-50 transition-all"
            >
              {createMut.isPending || sendMut.isPending ? "Creating..." : sendNow ? "Create & Send" : "Create & Schedule"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
