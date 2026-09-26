"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowLeft, Eye, PanelRight, Plus, Redo2, Save, Send, Undo2 } from "lucide-react";
import { cn } from "@allohq/ui";

export type StudioState = "draft" | "saved" | "approved";

const STATE_COPY: Record<StudioState, { label: string; className: string }> = {
  draft: { label: "Unsaved draft", className: "bg-[#FFF0B8] text-[#6b4d00] border-[#C99116]/40" },
  saved: { label: "Saved", className: "bg-[#ECE9E1] text-muted-foreground border-border" },
  approved: { label: "Approved", className: "bg-[#E5F4EE] text-[#157858] border-[#157858]/30" },
};

/**
 * The Studio's own top bar.
 *
 * The dashboard TopBar is built for browsing: store switcher, global search,
 * notifications, the Ask Joon dock. None of it helps while composing an email,
 * and all of it costs vertical space the canvas needs. This replaces it with
 * the actions that belong to editing one email — and, importantly, a way out.
 * A full-page surface with no visible exit is a trap.
 */
export function StudioTopBar({
  name,
  state,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPreview,
  onSave,
  saving,
  reviewHref,
  reviewBlocked,
  onAddBlock,
  onOpenTools,
  onBack,
}: {
  name: string;
  state: StudioState;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  onSave: () => void;
  saving: boolean;
  /** Where the existing review/delivery flow continues, when there is one. */
  reviewHref?: string | null;
  /** An unsaved or in-flight edit must not lead to approval of an older version. */
  reviewBlocked?: boolean;
  /**
   * Below xl the side panes are drawers, so their entry points have to live
   * here. Without them a merchant on a phone can preview an email and do
   * nothing else to it.
   */
  onAddBlock: () => void;
  onOpenTools: () => void;
  /** Return the merchant to wherever they came from. Routing belongs to the page. */
  onBack: () => void;
}) {
  const stateCopy = STATE_COPY[state];

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-[#FFFDF8] px-3 py-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Back</span>
      </button>

      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-[14px] font-medium">{name}</h1>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px]", stateCopy.className)}>
          {stateCopy.label}
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="xl:hidden">
          <BarButton label="Add block" onClick={onAddBlock}>
            <Plus className="h-4 w-4" />
          </BarButton>
        </span>
        <button
          type="button"
          onClick={onOpenTools}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E] xl:hidden"
        >
          <PanelRight className="h-3.5 w-3.5" />
          Tools
        </button>
        <BarButton label="Undo" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-4 w-4" />
        </BarButton>
        <BarButton label="Redo" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-4 w-4" />
        </BarButton>
        <BarButton label="Preview" onClick={onPreview}>
          <Eye className="h-4 w-4" />
        </BarButton>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#17204D] px-3 py-1.5 text-[12px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E] disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{saving ? "Saving…" : "Save version"}</span>
        </button>

        {reviewHref ? reviewBlocked ? (
          <button type="button" disabled title="Save this email before reviewing delivery" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] opacity-50">
            <Send className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Save before review</span>
          </button>
        ) : (
          <Link
            href={reviewHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Review delivery</span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function BarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border p-1.5 text-muted-foreground outline-none hover:bg-[#F4F2EC] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2D4F9E] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
