"use client";

import { ArrowRight, Pencil, Mail, Users } from "lucide-react";
import { cn } from "@allohq/ui";

interface CampaignPreviewCardProps {
  previewHtml: string;
  subject: string;
  campaignName: string;
  draftCampaignId: string;
  estimatedRecipients?: number;
  status?: string;
  constraints?: {
    audience?: string;
    requestedAudienceCount?: number | null;
    selectedAudienceCount?: number | null;
    offer?: string;
    controlPreference?: string;
    deliveryIntent?: string;
  };
  onApprove: (campaignId: string) => void;
  onEdit: (campaignId: string) => void;
}

export function CampaignPreviewCard({
  previewHtml,
  subject,
  campaignName,
  draftCampaignId,
  estimatedRecipients,
  status = "draft",
  constraints,
  onApprove,
  onEdit,
}: CampaignPreviewCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden my-2">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-3.5 h-3.5 text-decision" />
          <span className="font-sans text-[10px] uppercase tracking-wider text-decision">
            Here&apos;s your campaign
          </span>
        </div>
        <div className="font-sans text-[13px] font-semibold text-foreground">{campaignName}</div>
      </div>

      {/* Subject line */}
      <div className="px-4 py-2.5 border-b border-border/50 bg-card">
        <div className="font-sans text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          Subject
        </div>
        <div className="text-[13px] font-sans text-foreground font-medium">{subject}</div>
      </div>

      {/* Email preview iframe */}
      <div className="flex justify-center bg-muted/20 p-4">
        <div className="w-full max-w-[400px] rounded-lg border border-border overflow-hidden bg-card shadow-sm">
          <iframe
            srcDoc={previewHtml}
            title="Email preview"
            className="block w-full"
            style={{
              height: 300,
              border: "none",
              pointerEvents: "none",
            }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Footer: recipients + actions */}
      {constraints && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-[10px] sm:grid-cols-4">
          <Constraint label="Audience" value={constraints.audience} />
          <Constraint label="Offer" value={constraints.offer} />
          <Constraint label="Control" value={constraints.controlPreference} />
          <Constraint label="Delivery" value={constraints.deliveryIntent} />
        </div>
      )}
      <div className="px-4 py-3 border-t border-border bg-card flex items-center justify-between gap-3">
        {/* Recipient count */}
        {estimatedRecipients != null && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span className="font-mono text-[11px]">
              {estimatedRecipients.toLocaleString("en-IN")} recipient
              {estimatedRecipients !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => onEdit(draftCampaignId)}
            disabled={status === "unavailable"}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
              "border border-border text-[11px] font-sans font-medium",
              "text-foreground hover:bg-muted transition-colors"
            )}
          >
            <Pencil className="w-3 h-3" />
            {status === "draft"
              ? "Open draft"
              : status === "unavailable"
                ? "Draft unavailable"
                : "Open campaign"}
          </button>
          {status === "draft" && (
            <button
              onClick={() => onApprove(draftCampaignId)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                "bg-decision text-decision-foreground text-[11px] font-sans font-medium",
                "hover:opacity-90 transition-opacity"
              )}
            >
              Review audience
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Constraint({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium text-foreground">{value.replaceAll("_", " ")}</div>
    </div>
  );
}
