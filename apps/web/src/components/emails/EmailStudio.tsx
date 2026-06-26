"use client";

import * as React from "react";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Sparkles,
  Loader2,
  Wand2,
  Pencil,
  Undo2,
} from "lucide-react";
import { cn } from "@allohq/ui";
import { createDefaultBlock, type EmailBlock, type EmailBlockType } from "@allohq/email-builder";
import type { BrandKit } from "@allohq/emails";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { BlockEditor } from "./BlockEditor";
import { EmailPreviewFrame } from "./EmailPreviewFrame";

let idCounter = 0;
const newId = (type: string) => `${type}-${Date.now().toString(36)}-${idCounter++}`;

const ADDABLE: { type: EmailBlockType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "image", label: "Image" },
  { type: "button", label: "Button" },
  { type: "product", label: "Product" },
  { type: "testimonial", label: "Testimonial" },
  { type: "icon_row", label: "Reasons" },
  { type: "divider", label: "Divider" },
  { type: "spacer", label: "Spacer" },
];

/** Short human label for a block in the list. */
function blockTitle(b: EmailBlock): string {
  switch (b.type) {
    case "hero": return b.props.heading || "Hero";
    case "text": return (b.props.html || "").replace(/\s+/g, " ").slice(0, 42) || "Text";
    case "button": return `Button · ${b.props.text}`;
    case "product": return `Product · ${b.props.title || b.props.productId}`;
    case "testimonial": return `Quote · ${b.props.author}`;
    case "icon_row": return "Reasons row";
    case "image": return "Image";
    case "divider": return "Divider";
    case "spacer": return `Spacer · ${b.props.height}px`;
    default: return b.type;
  }
}

export function EmailStudio({
  initialBlocks,
  initialSubject,
  initialPreviewText,
  initialHtml,
  brandKit,
  previewVariables,
  reasoning,
  templateId,
}: {
  initialBlocks: EmailBlock[];
  initialSubject: string;
  initialPreviewText: string;
  initialHtml: string;
  /** Optional: when absent, the server resolves the workspace store's brand kit
      (so the one editor can load ANY template, not just the demo seed). */
  brandKit?: BrandKit;
  previewVariables: Record<string, string>;
  /** allo's short rationale for THIS draft, shown as a byline ("I wrote this for…"). */
  reasoning?: string;
  /** When editing a saved template, its id — enables the persistent "Save changes". */
  templateId?: string;
}) {
  const [blocks, setBlocks] = React.useState<EmailBlock[]>(initialBlocks);
  const [subject, setSubject] = React.useState(initialSubject);
  const [previewText] = React.useState(initialPreviewText);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    initialBlocks[0]?.id ?? null,
  );
  const [html, setHtml] = React.useState(initialHtml);
  const [instruction, setInstruction] = React.useState("");
  const [promptError, setPromptError] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);

  const renderMut = (trpc.emails as any).renderPreview.useMutation({
    onSuccess: (data: { html: string }) => setHtml(data.html),
  });
  const promptMut = (trpc.emails as any).promptEdit.useMutation();

  // Persistent save — only when editing a real saved template (templateId set).
  // The /emails demo seed has no templateId, so it stays ephemeral (and a demo
  // guest is blocked by the write-floor regardless).
  const { toast } = useToast();
  const saveMut = (trpc.templates as any).update.useMutation() as {
    mutate: (input: any, opts?: any) => void;
    isPending: boolean;
  };
  const handleSave = () => {
    if (!templateId) return;
    saveMut.mutate(
      { id: templateId, subject, previewText, blocks },
      {
        onSuccess: () => toast("Saved. Your changes are in.", "success"),
        onError: (e: { message?: string }) =>
          toast(e?.message || "Couldn't save — give it another go.", "error"),
      },
    );
  };

  // Re-render the preview whenever the content model changes (debounced).
  // First paint uses the server-rendered initialHtml, so we skip the mount run.
  // Skip the mount re-render only when we already have server-rendered HTML.
  // When loaded without SSR html (e.g. a template opened by id), render on mount.
  const firstRun = React.useRef(Boolean(initialHtml));
  const renderRef = React.useRef(renderMut);
  renderRef.current = renderMut;
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      renderRef.current.mutate({
        blocks,
        subject,
        previewText,
        variables: previewVariables,
        brandKit,
      });
    }, 350);
    return () => clearTimeout(t);
  }, [blocks, subject, previewText, previewVariables, brandKit]);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const updateBlock = (next: EmailBlock) =>
    setBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)));

  const move = (id: string, dir: -1 | 1) =>
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const remove = (id: string) =>
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });

  const add = (type: EmailBlockType) => {
    const block = createDefaultBlock(type, newId(type));
    setBlocks((prev) => [...prev, block]);
    setSelectedId(block.id);
    setShowAdd(false);
  };

  // Iteration history — each applied AI edit pushes the PRIOR version so the user
  // can step back ("didn't like it → go one iteration behind"). Session-scoped.
  const [history, setHistory] = React.useState<{ blocks: EmailBlock[]; subject: string }[]>([]);
  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1]!;
      setBlocks(prev.blocks);
      setSubject(prev.subject);
      setSelectedId(prev.blocks[0]?.id ?? null);
      return h.slice(0, -1);
    });
  };

  const applyInstruction = (text: string) => {
    if (!text.trim() || promptMut.isPending) return;
    setPromptError(null);
    promptMut.mutate(
      { instruction: text, blocks, subject, previewText },
      {
        onSuccess: (data: { applied: boolean; blocks: EmailBlock[]; subject?: string; error?: string }) => {
          if (data.applied) {
            setHistory((h) => [...h, { blocks, subject }]);
            setBlocks(data.blocks);
            if (typeof data.subject === "string") setSubject(data.subject);
            if (!data.blocks.some((b) => b.id === selectedId)) {
              setSelectedId(data.blocks[0]?.id ?? null);
            }
            setInstruction("");
          } else {
            setPromptError(data.error ?? "allo could not apply that edit.");
          }
        },
        onError: (e: { message?: string }) =>
          setPromptError(e.message ?? "allo is unavailable right now."),
      },
    );
  };
  const runPrompt = () => applyInstruction(instruction);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-7rem)] min-h-[640px]">
      {/* Framing header — allo authored this; you direct it (not a blank builder) */}
      <header className="shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--color-accent)]">
              allo · drafted this for you
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl font-serif font-semibold text-foreground tracking-tight">
                allo drafted this email.
              </h1>
              <span className="text-[13px] font-sans text-muted-foreground">
                Tell allo what to change — or fine-tune any block by hand.
              </span>
            </div>
          </div>
          {templateId ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMut.isPending}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-sans font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
            >
              {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {saveMut.isPending ? "Saving…" : "Save changes"}
            </button>
          ) : null}
        </div>
        {reasoning ? (
          <p className="mt-2 text-[12.5px] font-sans text-muted-foreground/90 leading-relaxed max-w-2xl">
            {reasoning}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 flex-1 min-h-0">
        {/* LEFT — editor: prompt-edit + block list + property panel */}
        <div className="flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
          {/* Prompt-edit (the wedge) */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className="w-4 h-4 text-[var(--color-accent)]" />
              <h2 className="text-[11px] font-mono uppercase tracking-[0.14em] text-foreground">
                Tell allo what to change
              </h2>
            </div>
            {/* Categorized chips — direct allo across dimensions; each runs a live edit */}
            <div className="space-y-2 mb-2.5">
              {(
                [
                  ["Subject", [
                    ["Punch up subject", "Rewrite the subject line to be more compelling and on-brand — no hype, no ALL-CAPS."],
                    ["Shorten subject", "Make the subject line shorter and punchier while keeping its meaning."],
                    ["A/B variant", "Rewrite the subject line as a strong alternative for an A/B test — a different angle, same intent."],
                  ]],
                  ["Copy", [
                    ["Warmer", "Make the tone warmer and more personal, like a short note from the founder."],
                    ["Funnier", "Add a light, tasteful touch of humour — warm and brand-appropriate, never cheesy."],
                    ["Shorter", "Make the whole email shorter and tighter: cut filler, keep the core message and the CTA."],
                    ["More urgent", "Add a gentle, honest sense of timeliness — never fake urgency or countdown pressure."],
                    ["Match brand voice", "Rewrite the copy to match the brand's voice and guidelines exactly."],
                  ]],
                  ["Visual", [
                    ["More visual", "Make it more visual: stronger hero, larger imagery, kept balanced and uncluttered."],
                    ["Change layout", "Restructure the layout for a fresh look while keeping the message and each block's intent."],
                    ["Swap product", "Swap the featured product for a different relevant one and update the copy to match."],
                  ]],
                  ["Tone", [
                    ["More formal", "Make the tone more formal and polished, while staying warm."],
                    ["More casual", "Make the tone more casual and conversational."],
                    ["Regenerate", "Regenerate this email with a fresh angle on the same goal and audience, keeping the brand voice."],
                  ]],
                ] as [string, [string, string][]][]
              ).map(([group, chips]) => (
                <div key={group} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground w-[52px] shrink-0">
                    {group}
                  </span>
                  {chips.map(([label, instr]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => applyInstruction(instr)}
                      disabled={promptMut.isPending}
                      className="px-2.5 py-1 rounded-full border border-border bg-background text-[11px] font-sans text-foreground hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runPrompt();
              }}
              rows={2}
              placeholder="make the hero warmer · drop the discount · shorten it · swap the product…"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
            <div className="flex items-center justify-between mt-2 gap-3">
              <div className="flex items-center gap-3">
                <p className="text-[11px] font-mono text-muted-foreground">⌘↵ to apply</p>
                {history.length > 0 ? (
                  <button
                    type="button"
                    onClick={undo}
                    className="inline-flex items-center gap-1 text-[11px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Undo2 className="w-3 h-3" /> Undo ({history.length})
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={runPrompt}
                disabled={promptMut.isPending || !instruction.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-sans font-medium text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"
              >
                {promptMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {promptMut.isPending ? "allo is editing…" : "Ask allo"}
              </button>
            </div>
            {promptError ? (
              <p className="mt-2 text-[12px] font-sans text-amber-600 dark:text-amber-400">
                {promptError}
              </p>
            ) : null}
          </section>

          {/* Subject line */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-1">
            <label className="block text-[10px] font-sans font-semibold text-muted-foreground uppercase tracking-[0.12em]">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </section>

          {/* Block list — direct manipulation: select / reorder / delete / add */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[var(--color-accent)]" />
                <h2 className="text-[11px] font-mono uppercase tracking-[0.14em] text-foreground">
                  Blocks
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAdd((s) => !s)}
                className="inline-flex items-center gap-1 text-[12px] font-sans text-[var(--color-accent)] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>

            {showAdd ? (
              <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-border bg-background/40">
                {ADDABLE.map((a) => (
                  <button
                    key={a.type}
                    type="button"
                    onClick={() => add(a.type)}
                    className="px-2.5 py-1 rounded-md border border-border text-[12px] font-sans text-foreground hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}

            <ul className="p-2 space-y-1">
              {blocks.map((b, i) => {
                const active = b.id === selectedId;
                return (
                  <li
                    key={b.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
                      active
                        ? "bg-[var(--color-accent)]/12 border border-[var(--color-accent)]/40"
                        : "border border-transparent hover:bg-muted",
                    )}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <span className="text-[10px] font-mono text-muted-foreground w-12 shrink-0 uppercase">
                      {b.type}
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] font-sans text-foreground truncate">
                      {blockTitle(b)}
                    </span>
                    <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconBtn label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(b.id, -1); }}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </IconBtn>
                      <IconBtn label="Move down" disabled={i === blocks.length - 1} onClick={(e) => { e.stopPropagation(); move(b.id, 1); }}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </IconBtn>
                      <IconBtn label="Delete" onClick={(e) => { e.stopPropagation(); remove(b.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </IconBtn>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Property panel (the control — pixel-level direct manipulation) */}
          <section className="rounded-xl border border-border bg-card">
            <BlockEditor block={selected} onUpdate={updateBlock} />
          </section>
        </div>

        {/* RIGHT — live preview */}
        <div className="min-h-0 lg:sticky lg:top-0">
          <EmailPreviewFrame html={html} isLoading={renderMut.isPending} />
        </div>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
