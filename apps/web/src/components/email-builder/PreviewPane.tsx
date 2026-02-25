"use client";

import { useState, useEffect, useRef } from "react";
import { Monitor, Smartphone, X, Loader2 } from "lucide-react";
import { cn } from "@allohq/ui";
import { trpc } from "@/lib/trpc";
import type { EmailBlock } from "@allohq/email-builder";

// ---------------------------------------------------------------------------
// PreviewPane
// ---------------------------------------------------------------------------

interface PreviewPaneProps {
  blocks: EmailBlock[];
  mode?: "desktop" | "mobile";
  open: boolean;
  onClose: () => void;
}

export function PreviewPane({ blocks, mode: initialMode, open, onClose }: PreviewPaneProps) {
  const [mode, setMode] = useState<"desktop" | "mobile">(initialMode ?? "desktop");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const renderMutation = trpc.templates.renderPreview.useMutation();

  // Render HTML whenever blocks or mode change
  useEffect(() => {
    if (!open) return;
    renderMutation.mutate({ blocks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blocks]);

  // Write rendered HTML into iframe
  useEffect(() => {
    if (!renderMutation.data || !iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(renderMutation.data.html);
      doc.close();
    }
  }, [renderMutation.data]);

  if (!open) return null;

  const width = mode === "desktop" ? 600 : 375;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-xl border border-gray-200 shadow-xl flex flex-col max-h-[90vh]">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-bold font-mono text-gray-900 tracking-wider uppercase">
            Preview
          </h3>

          <div className="flex items-center gap-2">
            {/* Desktop / Mobile toggle */}
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setMode("desktop")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-colors",
                  mode === "desktop"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-500 hover:text-gray-900"
                )}
              >
                <Monitor className="w-3.5 h-3.5" />
                Desktop
              </button>
              <button
                onClick={() => setMode("mobile")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono transition-colors",
                  mode === "mobile"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-500 hover:text-gray-900"
                )}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Mobile
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto bg-gray-100 flex justify-center p-6">
          {renderMutation.isPending ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title="Email Preview"
              className="bg-white border border-gray-200 rounded-lg shadow-sm transition-all"
              style={{ width, minHeight: 400, height: "100%" }}
              sandbox="allow-same-origin"
            />
          )}
        </div>
      </div>
    </div>
  );
}
