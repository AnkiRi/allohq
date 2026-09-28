"use client";
import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { ScopeChooser, type AskScope } from "./AskScope";
import { VisualProposalCard, type VisualProposal } from "./VisualProposalCard";
import type { EmailBlock } from "@allohq/email-builder";

export type ProposalHistoryItem = {
  id: string; instruction: string; scope?: string | null; status: string;
  createdAt: string | Date; resolvedAt?: string | Date | null;
  operations?: { editScope?: { kind: string; blockId?: string } };
};

export function AskPanel({ visualProposal, onVisualGenerate, onVisualRefine, onVisualCancel, inputRef, selected, scope, setScope, instruction, setInstruction, pending, error, onAsk, history }: {
  embedded?: boolean; visualProposal: VisualProposal | null;
  onVisualGenerate: () => void; onVisualRefine: () => void; onVisualCancel: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>; selected: EmailBlock | null;
  scope: AskScope; setScope: (scope: AskScope) => void;
  instruction: string; setInstruction: (text: string) => void; pending: boolean; error: string | null;
  onAsk: (text?: string, scope?: "subject" | "copy" | "visual" | "tone") => void;
  history: ProposalHistoryItem[];
}) {
  const suggestions = selected?.type === "button"
    ? ["Make the button full width", "Make the button larger", "Stronger call to action"]
    : selected?.type === "product" ? ["Stronger call to action", "Hide the product description"]
    : selected?.type === "countdown" ? ["Make the label clearer"]
    : !selected ? ["Tighten the whole email", "Try a warmer direction"]
    : ["Make this clearer", "Shorten this block", "Match our brand voice"];
  const relevantHistory = selected
    ? history.filter((item) => item.operations?.editScope?.kind === "block" && item.operations.editScope.blockId === selected.id)
    : history;
  return <div className="flex min-h-0 flex-col">
    {!selected ? <ScopeChooser scope={scope} setScope={setScope} selectedTitle={null} /> : null}
    {visualProposal ? <VisualProposalCard proposal={visualProposal} onGenerate={onVisualGenerate} onRefine={onVisualRefine} onCancel={onVisualCancel} /> : null}
    {relevantHistory.length ? <div className="mt-3 space-y-2" aria-label="Recent requests">
      {relevantHistory.slice(-8).map((item) => <div key={item.id} className="rounded-lg bg-[#F4F2EC] p-2.5">
        <div className="flex items-start justify-between gap-2"><p className="text-[12px] leading-5">{item.instruction}</p><span className="text-[11px] text-muted-foreground">{item.status}</span></div>
        <p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
      </div>)}
    </div> : <p className="mt-2 text-[12px] leading-5 text-muted-foreground">Ask for wording or supported styling. Joon proposes a change for you to review; it cannot replace store facts or change this block’s type.</p>}
    <div className="mt-3 flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onAsk(suggestion)} disabled={pending} className="rounded-lg border border-border px-2 py-1.5 text-[12px] hover:bg-[#F4F2EC] disabled:opacity-40">{suggestion}</button>)}</div>
    <div className="mt-3 rounded-lg border border-border bg-white p-2 focus-within:border-[#2D4F9E]">
      <textarea ref={inputRef} value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onAsk(); } }} rows={3} aria-label="Ask Joon instruction"
        placeholder={selected ? "Ask for a change to this block…" : "Ask about the subject or email…"} className="w-full resize-none bg-transparent text-[14px] leading-5 outline-none" />
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Enter to propose · Shift Enter for a new line</span><button type="button" onClick={() => onAsk()} disabled={pending || !instruction.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#17204D] text-white disabled:opacity-40" aria-label="Ask Joon">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
    </div>
    {error ? <p role="alert" className="mt-2 text-[12px] leading-5 text-[var(--risk,#B95849)]">{error}</p> : null}
  </div>;
}
