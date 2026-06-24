"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface WhyButtonProps {
  context: string;
  storeId: string;
}

export function WhyButton({ context, storeId }: WhyButtonProps) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const explainMutation = (trpc.ai.explain as any).useMutation({
    onSuccess: (data: { explanation: string }) => {
      setExplanation(data.explanation);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!explanation) {
      explainMutation.mutate({ context, storeId });
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        onClick={handleClick}
        className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-sans font-bold text-muted-foreground hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] transition-all duration-200 cursor-pointer flex-shrink-0"
        title="Why?"
      >
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-[260px] rounded-xl border border-border p-3 shadow-lg bg-card/95 backdrop-blur-xl"
          >
            {/* Arrow */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t border-border bg-card" />

            {explainMutation.isPending ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                <span
                  className="text-[11px] text-muted-foreground"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  Let me explain...
                </span>
              </div>
            ) : explainMutation.isError ? (
              <p
                className="text-[11px] text-[var(--color-urgent)] leading-relaxed"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                I couldn&apos;t pull that together just now. Mind trying again?
              </p>
            ) : explanation ? (
              <p
                className="text-[11px] text-foreground/80 leading-relaxed"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                {explanation}
              </p>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
