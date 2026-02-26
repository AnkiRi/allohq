"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Zap, Bell, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

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

export function TopBar() {
  const { toast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [instruction, setInstruction] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [result, setResult] = useState<ResultState>(null);
  const [showResult, setShowResult] = useState(false);

  const { data: stores } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id ?? "";

  const executeMut = (trpc.ai.executeInstruction as any).useMutation({
    onSuccess: (data: ResultState) => {
      setResult(data);
      setIsProcessing(false);
      setShowResult(true);
      if (data?.success) {
        toast(data.summary, "success");
      }
    },
    onError: (err: { message?: string }) => {
      setIsProcessing(false);
      setProcessingStep("");
      toast(err.message ?? "Failed to execute instruction", "error");
    },
  }) as { mutate: (input: { instruction: string; pageContext: string; storeId: string }) => void; isPending: boolean };

  const handleSubmit = useCallback(() => {
    if (!instruction.trim() || isProcessing || !storeId) return;

    setIsProcessing(true);
    setResult(null);
    setShowResult(false);

    setProcessingStep("Understanding instruction...");
    const timer1 = setTimeout(() => setProcessingStep("Generating content..."), 2000);
    const timer2 = setTimeout(() => setProcessingStep("Creating resources..."), 5000);

    executeMut.mutate({
      instruction: instruction.trim(),
      pageContext: "dashboard",
      storeId,
    });

    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [instruction, isProcessing, storeId]);

  // Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleNavigate = (path: string) => {
    router.push(path);
    setResult(null);
    setShowResult(false);
    setInstruction("");
  };

  return (
    <header className="bg-card border-b border-border">
      <div className="h-14 flex items-center justify-between px-6">
        {/* Command bar */}
        <div className="flex-1 max-w-xl">
          <div className="relative flex items-center">
            {isProcessing ? (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground animate-spin" />
            ) : (
              <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder={storeId ? "Tell AlloHQ what to do..." : "Connect a store to start..."}
              disabled={isProcessing || !storeId}
              className="w-full pl-9 pr-16 py-2 border border-border rounded-lg text-[13px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] transition-all disabled:opacity-50"
            />
            <span className="absolute right-3 text-[10px] text-muted-foreground/50 font-mono">
              {isProcessing ? processingStep.split("...")[0] : "\u2318K"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 ml-6">
          <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-secondary rounded-full" />
          </button>
        </div>
      </div>

      {/* Result banner (below top bar) */}
      {showResult && result && (
        <div className={`px-6 py-3 border-t ${result.success ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
          <div className="flex items-start justify-between max-w-xl">
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={`text-sm font-mono ${result.success ? "text-green-900" : "text-red-900"}`}>
                  {result.summary}
                </p>
                {result.success && (
                  <div className="flex gap-2 mt-2">
                    {result.created.automationId && (
                      <button onClick={() => handleNavigate(`/automations/${result.created.automationId}`)}
                        className="text-xs font-mono px-2.5 py-1 bg-white border border-green-300 rounded text-green-700 hover:bg-green-100 transition-all">
                        View Automation
                      </button>
                    )}
                    {result.created.campaignId && (
                      <button onClick={() => handleNavigate("/campaigns")}
                        className="text-xs font-mono px-2.5 py-1 bg-white border border-green-300 rounded text-green-700 hover:bg-green-100 transition-all">
                        View Campaign
                      </button>
                    )}
                    {result.created.segmentId && (
                      <button onClick={() => handleNavigate("/segments")}
                        className="text-xs font-mono px-2.5 py-1 bg-white border border-green-300 rounded text-green-700 hover:bg-green-100 transition-all">
                        View Segment
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => { setShowResult(false); setInstruction(""); }} className="text-muted-foreground hover:text-muted-foreground ml-4">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
