"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

interface CommandBarProps {
  storeId: string;
  pageContext: "automations" | "campaigns" | "templates" | "segments" | "dashboard";
}

type ResultState = {
  intent: string;
  success: boolean;
  summary: string;
  created: {
    automationId?: string;
    campaignId?: string;
    templateIds?: string[];
    segmentId?: string;
  };
} | null;

const EXAMPLES: Record<string, string[]> = {
  automations: [
    "Create a win-back flow for inactive customers who spent over ₹500",
    "Build a welcome series with email, SMS, and WhatsApp",
    "Set up an abandoned cart automation with 20% discount",
  ],
  campaigns: [
    "Send a Black Friday campaign to all VIP customers",
    "Create a spring sale email for the Champions segment",
    "Send a 15% off campaign to at-risk customers",
  ],
  templates: [
    "Design a thank-you email for post-purchase follow-up",
    "Create an SMS template for flash sale notifications",
    "Build a promotional email with visual-heavy design",
  ],
  segments: [
    "Find customers who spent over ₹200 but haven't ordered in 30 days",
    "Show me my most valuable customers",
    "Create a segment of new customers from the last 7 days",
  ],
  dashboard: [
    "Create an automation for winning back inactive customers",
    "Analyze my top customer segments",
    "Send a promotion to my VIP segment",
  ],
};

export function CommandBar({ storeId, pageContext }: CommandBarProps) {
  const { toast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [instruction, setInstruction] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [result, setResult] = useState<ResultState>(null);
  const [isFocused, setIsFocused] = useState(false);

  const examples = EXAMPLES[pageContext] ?? EXAMPLES["dashboard"]!;

  const executeMut = (trpc.ai.executeInstruction as any).useMutation({
    onSuccess: (data: ResultState) => {
      setResult(data);
      setIsProcessing(false);
      if (data?.success) {
        toast(data.summary, "success");
      }
    },
    onError: (err: { message?: string }) => {
      setIsProcessing(false);
      setProcessingStep("");
      toast(err.message ?? "I couldn't quite get that done. Mind trying again?", "error");
    },
  }) as { mutate: (input: { instruction: string; pageContext: string; storeId: string }) => void; isPending: boolean };

  const handleSubmit = useCallback(() => {
    if (!instruction.trim() || isProcessing) return;

    setIsProcessing(true);
    setResult(null);

    // Simulate progressive steps
    setProcessingStep("Making sure I've got this right...");
    setTimeout(() => {
      if (isProcessing) setProcessingStep("Writing it up...");
    }, 2000);
    setTimeout(() => {
      if (isProcessing) setProcessingStep("Putting it all together...");
    }, 5000);

    executeMut.mutate({
      instruction: instruction.trim(),
      pageContext,
      storeId,
    });
  }, [instruction, isProcessing, pageContext, storeId]);

  // Keyboard shortcut: Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setIsFocused(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNavigate = (path: string) => {
    router.push(path);
    setResult(null);
    setInstruction("");
  };

  return (
    <div className="mb-6">
      {/* Input bar */}
      <div
        className={`relative border rounded-xl transition-all ${
          isFocused
            ? "border-foreground shadow-[0_0_0_1px_hsl(var(--foreground))]"
            : "border-border hover:border-primary/50"
        }`}
      >
        <div className="flex items-center px-4 py-3">
          <Zap className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Tell allo what you'd like to do..."
            disabled={isProcessing}
            className="flex-1 ml-3 text-[13px] font-sans text-foreground placeholder:text-muted-foreground bg-transparent outline-none disabled:opacity-50"
          />
          <span className="text-[10px] text-muted-foreground/50 font-mono ml-2">
            {isProcessing ? "" : "\u2318K"}
          </span>
        </div>

        {/* Examples row (when focused and empty) */}
        {isFocused && !instruction && !isProcessing && !result && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {examples.map((ex, i) => (
              <button
                key={i}
                onClick={() => {
                  setInstruction(ex);
                  inputRef.current?.focus();
                }}
                className="text-[11px] font-sans text-muted-foreground px-2.5 py-1 bg-muted rounded-lg hover:bg-muted hover:text-muted-foreground transition-all text-left"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Processing state */}
      {isProcessing && (
        <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-muted border border-border rounded-xl">
          <Loader2 className="w-4 h-4 text-foreground animate-spin flex-shrink-0" />
          <div>
            <p className="text-[13px] font-bold text-foreground font-sans">{processingStep}</p>
            <p className="text-[11px] text-muted-foreground font-sans mt-0.5">Bigger asks can take up to a minute. Hang tight.</p>
          </div>
        </div>
      )}

      {/* Result card */}
      {result && (
        <div
          className={`mt-3 px-4 py-4 rounded-xl border ${
            result.success
              ? "bg-green-50 border-green-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={`text-[13px] font-bold font-sans ${result.success ? "text-green-900" : "text-red-900"}`}>
                  {result.summary}
                </p>
                {result.success && (
                  <div className="flex gap-2 mt-3">
                    {result.created.automationId && (
                      <button
                        onClick={() => handleNavigate(`/automations/${result.created.automationId}`)}
                        className="text-[11px] font-sans px-3 py-1.5 bg-card border border-green-300 rounded-lg text-green-700 hover:bg-green-100 transition-all"
                      >
                        View & Edit
                      </button>
                    )}
                    {result.created.campaignId && (
                      <button
                        onClick={() => handleNavigate(`/campaigns`)}
                        className="text-[11px] font-sans px-3 py-1.5 bg-card border border-green-300 rounded-lg text-green-700 hover:bg-green-100 transition-all"
                      >
                        View Campaign
                      </button>
                    )}
                    {result.created.templateIds && result.created.templateIds.length > 0 && !result.created.automationId && !result.created.campaignId && (
                      <button
                        onClick={() => handleNavigate(`/templates/${result.created.templateIds![0]}/edit`)}
                        className="text-[11px] font-sans px-3 py-1.5 bg-card border border-green-300 rounded-lg text-green-700 hover:bg-green-100 transition-all"
                      >
                        View Template
                      </button>
                    )}
                    {result.created.segmentId && (
                      <button
                        onClick={() => handleNavigate(`/segments`)}
                        className="text-[11px] font-sans px-3 py-1.5 bg-card border border-green-300 rounded-lg text-green-700 hover:bg-green-100 transition-all"
                      >
                        View Segment
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setResult(null);
                setInstruction("");
              }}
              className="text-muted-foreground hover:text-muted-foreground transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
