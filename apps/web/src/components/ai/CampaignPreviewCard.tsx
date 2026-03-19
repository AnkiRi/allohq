"use client";

import { useState } from "react";
import { Send, Pencil, Loader2, Mail, Users, CheckCircle2 } from "lucide-react";
import { cn } from "@allohq/ui";

interface CampaignPreviewCardProps {
  previewHtml: string;
  subject: string;
  campaignName: string;
  draftCampaignId: string;
  estimatedRecipients?: number;
  onApprove: (campaignId: string) => void;
  onEdit: (campaignId: string) => void;
}

export function CampaignPreviewCard({
  previewHtml,
  subject,
  campaignName,
  draftCampaignId,
  estimatedRecipients,
  onApprove,
  onEdit,
}: CampaignPreviewCardProps) {
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const handleApprove = () => {
    setApproving(true);
    onApprove(draftCampaignId);
    // Optimistic UI — parent will handle actual mutation
    setTimeout(() => {
      setApproving(false);
      setApproved(true);
    }, 1500);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden my-2">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-3.5 h-3.5 text-[var(--color-accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
            Campaign Preview
          </span>
        </div>
        <div className="font-mono text-[13px] font-semibold text-foreground">
          {campaignName}
        </div>
      </div>

      {/* Subject line */}
      <div className="px-4 py-2.5 border-b border-border/50 bg-card">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          Subject
        </div>
        <div className="text-[13px] font-sans text-foreground font-medium">
          {subject}
        </div>
      </div>

      {/* Email preview iframe */}
      <div className="flex justify-center bg-muted/20 p-4">
        <div className="rounded-lg border border-border overflow-hidden bg-white shadow-sm">
          <iframe
            srcDoc={previewHtml}
            title="Email preview"
            className="block"
            style={{
              width: 400,
              height: 300,
              border: "none",
              pointerEvents: "none",
            }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Footer: recipients + actions */}
      <div className="px-4 py-3 border-t border-border bg-card flex items-center justify-between gap-3">
        {/* Recipient count */}
        {estimatedRecipients != null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span className="font-mono text-[11px]">
              {estimatedRecipients.toLocaleString()} recipient{estimatedRecipients !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => onEdit(draftCampaignId)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
              "border border-border text-[11px] font-mono font-medium",
              "text-foreground hover:bg-muted transition-colors",
            )}
          >
            <Pencil className="w-3 h-3" />
            Edit First
          </button>

          {approved ? (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                "bg-[var(--color-success)] text-white text-[11px] font-mono font-medium",
              )}
            >
              <CheckCircle2 className="w-3 h-3" />
              Sending
            </div>
          ) : (
            <button
              onClick={handleApprove}
              disabled={approving}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                "bg-[var(--color-accent)] text-white text-[11px] font-mono font-medium",
                "hover:opacity-90 transition-opacity",
                approving && "opacity-60 cursor-not-allowed",
              )}
            >
              {approving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              {approving ? "Approving..." : "Approve & Send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
