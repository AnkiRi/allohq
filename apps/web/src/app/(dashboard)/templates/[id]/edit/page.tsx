"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Wand2, ChevronDown, ChevronRight, RotateCcw, Check, X } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { EmailCanvas } from "@/components/email-builder/EmailCanvas";
import type { EmailBlock } from "@allohq/email-builder";

const AI_MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.5" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
] as const;

const TONE_OPTIONS = [
  "Very Formal",
  "Professional",
  "Balanced",
  "Casual",
  "Playful",
] as const;

export default function EditTemplatePage() {
  const params = useParams();
  const templateId = params.id as string;
  const { toast } = useToast();

  // Store for regeneration context
  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  // Layout templates
  const { data: layouts } = (trpc.ai as any).layoutTemplates.useQuery() as {
    data: { id: string; name: string; description: string }[] | undefined;
  };

  const { data: template, isLoading } = trpc.templates.getById.useQuery({ id: templateId }) as {
    data: { id: string; name: string; subject: string; blocks: unknown } | undefined;
    isLoading: boolean;
  };
  const updateMut = trpc.templates.update.useMutation();
  const regenerateMut = (trpc.ai as any).regenerateEmail.useMutation({
    onError: (err: { message?: string }) => toast(err.message || "That rewrite didn't go through. Mind trying again?", "error"),
  }) as {
    mutateAsync: (input: any) => Promise<{ blocks: EmailBlock[]; subject: string; previewText: string; reasoning: string; model: string }>;
    isPending: boolean;
  };

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");

  // AI Controls state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiModel, setAiModel] = useState<string>("claude-sonnet-4-6");
  const [creativeIntensity, setCreativeIntensity] = useState<string>("balanced");
  const [toneOverride, setToneOverride] = useState<string>("");
  const [layoutTemplate, setLayoutTemplate] = useState<string>("");
  const [feedback, setFeedback] = useState("");

  // Regeneration preview
  const [pendingBlocks, setPendingBlocks] = useState<EmailBlock[] | null>(null);
  const [pendingSubject, setPendingSubject] = useState<string | null>(null);
  const [canvasBlocks, setCanvasBlocks] = useState<EmailBlock[]>([]);
  const [blocksLoaded, setBlocksLoaded] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubject(template.subject);
      setCanvasBlocks(template.blocks as unknown as EmailBlock[]);
      setBlocksLoaded(true);
    }
  }, [template]);

  async function handleSave(blocks: EmailBlock[]) {
    await updateMut.mutateAsync({
      id: templateId,
      name,
      subject,
      blocks: blocks as any,
    });
    setCanvasBlocks(blocks);
    toast("Your template is saved.", "success");
  }

  async function handleRegenerate() {
    if (!storeId) {
      toast("Connect a store first so allo can rewrite this.", "error");
      return;
    }
    try {
      const result = await regenerateMut.mutateAsync({
        templateId,
        storeId,
        feedback: feedback || undefined,
        model: aiModel || undefined,
        creativeIntensity: creativeIntensity !== "balanced" ? creativeIntensity : undefined,
        toneOverride: toneOverride || undefined,
        layoutTemplate: layoutTemplate || undefined,
      });
      setPendingBlocks(result.blocks);
      setPendingSubject(result.subject);
      toast(`allo rewrote this with ${result.model}. Keep it or set it aside.`, "info");
    } catch {
      // Error handled by mutation onError
    }
  }

  function handleAcceptRegeneration() {
    if (!pendingBlocks) return;
    setCanvasBlocks(pendingBlocks);
    if (pendingSubject) {
      setSubject(pendingSubject);
      setName(pendingSubject);
    }
    setPendingBlocks(null);
    setPendingSubject(null);
    setFeedback("");
    toast("Done — the new version is in.", "success");
  }

  function handleRejectRegeneration() {
    setPendingBlocks(null);
    setPendingSubject(null);
    toast("No worries — kept your original.", "info");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[13px] text-muted-foreground font-sans">Loading your template…</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[13px] text-muted-foreground font-sans">We couldn't find this template.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link href="/templates" className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="flex-1 flex items-center gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-[18px] tracking-[-0.5px] font-bold text-foreground font-sans bg-transparent border-none outline-none"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-[13px] text-muted-foreground font-sans bg-transparent border border-border rounded-lg px-3 py-1.5 outline-none focus:border-muted-foreground w-64"
            placeholder="Subject line..."
          />
        </div>
      </div>

      {/* AI Controls Panel */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <button
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-[12px] font-bold font-sans text-foreground">Rewrite with allo</span>
            <span className="text-[10px] font-sans text-muted-foreground">— give it a fresh take</span>
          </div>
          {aiPanelOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>

        {aiPanelOpen && (
          <div className="px-4 pb-4 pt-1 border-t border-border space-y-4">
            {/* Accept/Reject bar if regeneration pending */}
            {pendingBlocks && (
              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-[11px] font-sans text-amber-800 flex-1">Here's a fresh take — take a look, then keep it or set it aside.</span>
                <button
                  onClick={handleAcceptRegeneration}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-[11px] font-sans hover:bg-green-700 transition-colors"
                >
                  <Check className="w-3 h-3" /> Accept
                </button>
                <button
                  onClick={handleRejectRegeneration}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-[11px] font-sans hover:bg-red-700 transition-colors"
                >
                  <X className="w-3 h-3" /> Reject
                </button>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4">
              {/* Model */}
              <div>
                <label className="text-[10px] font-sans text-muted-foreground block mb-1">MODEL</label>
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground focus:outline-none"
                >
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Creative Balance */}
              <div>
                <label className="text-[10px] font-sans text-muted-foreground block mb-1">CREATIVE BALANCE</label>
                <select
                  value={creativeIntensity}
                  onChange={(e) => setCreativeIntensity(e.target.value)}
                  className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground focus:outline-none"
                >
                  <option value="text_heavy">Text Heavy</option>
                  <option value="balanced">Balanced</option>
                  <option value="visual_heavy">Visual Heavy</option>
                </select>
              </div>

              {/* Tone */}
              <div>
                <label className="text-[10px] font-sans text-muted-foreground block mb-1">TONE</label>
                <select
                  value={toneOverride}
                  onChange={(e) => setToneOverride(e.target.value)}
                  className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground focus:outline-none"
                >
                  <option value="">Brand Default</option>
                  {TONE_OPTIONS.map((t) => (
                    <option key={t} value={t.toLowerCase()}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Layout */}
              <div>
                <label className="text-[10px] font-sans text-muted-foreground block mb-1">LAYOUT</label>
                <select
                  value={layoutTemplate}
                  onChange={(e) => setLayoutTemplate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-[11px] font-sans text-foreground focus:outline-none"
                >
                  <option value="">Auto</option>
                  {layouts?.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Feedback input + regenerate */}
            <div className="flex gap-3">
              <input
                type="text"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tell allo what to change… e.g. 'make the hero bolder, add a 20% discount'"
                onKeyDown={(e) => e.key === "Enter" && !regenerateMut.isPending && handleRegenerate()}
                className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-[12px] font-sans text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-secondary"
              />
              <button
                onClick={handleRegenerate}
                disabled={regenerateMut.isPending || !storeId}
                className="flex items-center gap-1.5 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-[11px] font-sans hover:bg-secondary/90 disabled:opacity-50 transition-all"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${regenerateMut.isPending ? "animate-spin" : ""}`} />
                {regenerateMut.isPending ? "Rewriting…" : "Rewrite"}
              </button>
            </div>
          </div>
        )}
      </div>

      {blocksLoaded ? (
        <EmailCanvas
          initialBlocks={pendingBlocks ?? canvasBlocks}
          key={pendingBlocks ? "pending" : "current"}
          templateId={templateId}
          onSave={handleSave}
        />
      ) : (
        <div className="flex items-center justify-center h-64 border border-border rounded-xl bg-card">
          <div className="text-[13px] text-muted-foreground font-sans">Loading your email…</div>
        </div>
      )}
    </div>
  );
}
