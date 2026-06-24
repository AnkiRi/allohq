"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Palette } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { ReasoningReveal, type ReasoningStory } from "@/components/console/ReasoningReveal";

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

  // What allo is about to do — its reasoning, the predicted upside, the named
  // downside, and confidence. An ESTIMATE until control data backs it (no run yet).
  const selectedSegment = segmentId ? segments?.find((s) => s.id === segmentId) : undefined;
  const selectedTemplate = templates?.find((t) => t.id === templateId);
  const reach = selectedSegment?.customerCount;
  const holdout = reach ? Math.max(1, Math.round(reach * 0.1)) : undefined;
  const willMessage = reach && holdout ? reach - holdout : undefined;
  const reviewStory: ReasoningStory = {
    lead: name || "this campaign",
    lines: [
      selectedSegment
        ? { text: `${reach!.toLocaleString("en-IN")} customers like this · ${selectedSegment.name}` }
        : { text: "everyone who's opted in to hear from you" },
      selectedTemplate ? { text: `writing in your voice · "${selectedTemplate.subject}"` } : { text: "writing in your voice" },
      holdout
        ? { text: `holding back ${holdout.toLocaleString("en-IN")} as control · left alone to measure lift`, beat: true }
        : { text: "a slice held back as control · so lift is real, not guessed", beat: true },
      { text: "estimate: upside before fees · projected unsub under 0.4% · confidence moderate" },
      {
        text: willMessage
          ? `ready · ${willMessage.toLocaleString("en-IN")} will hear from you on your sign-off`
          : "ready · goes out on your sign-off",
        arrow: true,
      },
    ],
  };

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
      toast("Created and on its way.", "success");
    } else {
      toast("Your campaign is ready.", "success");
    }

    router.push(`/campaigns/${campaign.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/campaigns" className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <h1 className="text-[18px] tracking-[-0.5px] font-semibold text-foreground font-serif">New campaign</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <button
              onClick={() => i <= currentIdx && setStep(s.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-sans transition-all ${
                s.key === step
                  ? "bg-secondary text-secondary-foreground"
                  : i < currentIdx
                    ? "bg-muted text-foreground"
                    : "bg-card border border-border text-muted-foreground"
              }`}
            >
              {i < currentIdx && <Check className="w-3 h-3" />}
              {s.label}
            </button>
            {i < steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/50" />}
          </div>
        ))}
      </div>

      {/* Brand analysis gate */}
      {storeId && !hasBrandProfile && (
        <div className="flex items-center gap-3 px-4 py-3 bg-card border-l-4 border-l-[var(--color-accent)] border border-border rounded-xl">
          <Palette className="w-4 h-4 text-[var(--color-accent)] flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-bold text-foreground">Let's set up your brand voice first</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Once allo knows how your brand sounds, everything it writes will feel like you.
            </p>
          </div>
          <Link
            href="/intelligence/brand"
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-xs font-sans hover:opacity-90 transition-all whitespace-nowrap"
          >
            <Palette className="w-3.5 h-3.5" />
            Set up brand
          </Link>
        </div>
      )}

      {/* Step content */}
      <div className="border border-border rounded-xl bg-card p-6">
        {step === "details" && (
          <div className="space-y-4">
            <h2 className="text-[13px] font-bold text-foreground font-serif">Campaign Details</h2>
            <div>
              <label className="block text-[11px] text-muted-foreground font-sans mb-1">Campaign Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-[13px] font-sans outline-none focus:border-muted-foreground"
                placeholder="e.g., Summer Sale 2026"
              />
            </div>
            <button
              onClick={() => setStep("template")}
              disabled={!name}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {step === "template" && (
          <div className="space-y-4">
            <h2 className="text-[13px] font-bold text-foreground font-serif">Select Template</h2>
            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            ) : templates && templates.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={`text-left p-3 border rounded-lg transition-all ${
                      templateId === t.id
                        ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <p className="text-[11px] font-bold text-foreground truncate">{t.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.subject}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No templates yet.{" "}
                <Link href="/templates/new" className="underline">
                  Create one
                </Link>
              </p>
            )}
            <button
              onClick={() => setStep("audience")}
              disabled={!templateId}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {step === "audience" && (
          <div className="space-y-4">
            <h2 className="text-[13px] font-bold text-foreground font-serif">Select Audience</h2>
            {segmentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            ) : (
            <div className="space-y-2">
              <button
                onClick={() => setSegmentId(undefined)}
                className={`w-full text-left p-3 border rounded-lg transition-all ${
                  !segmentId ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]" : "border-border hover:border-primary/50"
                }`}
              >
                <p className="text-[11px] font-bold text-foreground">All Subscribers</p>
                <p className="text-[10px] text-muted-foreground">Everyone who's opted in to hear from you</p>
              </button>
              {segments?.map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => setSegmentId(seg.id)}
                  className={`w-full text-left p-3 border rounded-lg transition-all ${
                    segmentId === seg.id ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]" : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold text-foreground">{seg.name}</p>
                    <span className="text-[10px] text-muted-foreground font-mono">{seg.customerCount} customers</span>
                  </div>
                  {seg.description && <p className="text-[10px] text-muted-foreground mt-0.5">{seg.description}</p>}
                </button>
              ))}
            </div>
            )}
            <button
              onClick={() => setStep("schedule")}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 transition-all"
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {step === "schedule" && (
          <div className="space-y-4">
            {/* What allo will do — reasoning + named downside, before you commit */}
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <ReasoningReveal stories={[reviewStory]} />
            </div>
            <h2 className="text-[13px] font-bold text-foreground font-serif">When to Send</h2>
            <div className="space-y-2">
              <button
                onClick={() => setSendNow(true)}
                className={`w-full text-left p-3 border rounded-lg transition-all ${
                  sendNow ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]" : "border-border hover:border-primary/50"
                }`}
              >
                <p className="text-[11px] font-bold text-foreground">Send Now</p>
                <p className="text-[10px] text-muted-foreground">Goes out the moment you're done</p>
              </button>
              <button
                onClick={() => setSendNow(false)}
                className={`w-full text-left p-3 border rounded-lg transition-all ${
                  !sendNow ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]" : "border-border hover:border-primary/50"
                }`}
              >
                <p className="text-[11px] font-bold text-foreground">Schedule</p>
                <p className="text-[10px] text-muted-foreground">Pick a date and time</p>
              </button>
              {!sendNow && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-[13px] font-mono outline-none focus:border-muted-foreground"
                />
              )}
            </div>
            <button
              onClick={handleCreate}
              disabled={createMut.isPending || sendMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
            >
              {createMut.isPending || sendMut.isPending ? "Creating…" : sendNow ? "Create & Send" : "Create & Schedule"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
