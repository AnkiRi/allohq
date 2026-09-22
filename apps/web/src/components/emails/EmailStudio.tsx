"use client";

import * as React from "react";
import {
  Check, Code2, FileClock, ImagePlus, Inspect, Loader2,
  MessageSquareText, Plus, Send, ShieldCheck, ShoppingBag, Sparkles, X,
} from "lucide-react";
import { cn } from "@allohq/ui";
import {
  createDefaultBlock, emailBlockSchema, emailBlocksSchema, preflightEmailDocument,
  type EmailBlock, type EmailBlockType,
} from "@allohq/email-builder";
import type { BrandKit } from "@allohq/emails";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { useIsDesktop } from "@/lib/use-breakpoint";
import { BlockList } from "./BlockList";
import { StudioTopBar } from "./StudioTopBar";
import { ScopeChooser, type AskScope } from "./AskScope";
import { ShopifyDataPanel } from "./ShopifyDataPanel";
import { VisualGenerator, type GeneratedVisual, type VisualFailure, type VisualMode, type VisualSlotDraft } from "./VisualGenerator";
import { BlockEditor } from "./BlockEditor";
import { EmailPreviewFrame } from "./EmailPreviewFrame";

type StudioTab = "ask" | "inspect" | "shopify" | "visuals" | "versions" | "code" | "preflight";
type Snapshot = { id: string; label: string; createdAt: Date; blocks: EmailBlock[]; subject: string; previewText: string };
type Proposal = { id?: string; blocks: EmailBlock[]; subject: string; previewText: string; instruction: string; createdAt: Date };
type DurableVersion = { id: string; sequence: number; source: string; note?: string | null; createdAt: string | Date; document: unknown };
type ProposalHistoryItem = { id: string; instruction: string; scope?: string | null; status: string; createdAt: string | Date; resolvedAt?: string | Date | null };

let idCounter = 0;
const newId = (type: string) => `${type}-${Date.now().toString(36)}-${idCounter++}`;
const ADDABLE: { type: EmailBlockType; label: string }[] = [
  { type: "hero", label: "Hero" }, { type: "text", label: "Text" },
  { type: "image", label: "Image" }, { type: "button", label: "Button" },
  { type: "product", label: "Product" }, { type: "product_grid", label: "Product grid" },
  { type: "testimonial", label: "Testimonial" }, { type: "icon_row", label: "Reasons" },
  { type: "divider", label: "Divider" }, { type: "spacer", label: "Spacer" },
  { type: "custom_html", label: "Custom HTML" },
];

function blockTitle(block: EmailBlock): string {
  switch (block.type) {
    case "hero": return block.props.heading || "Hero";
    case "text": return block.props.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) || "Text";
    case "button": return block.props.text || "Button";
    case "product": return block.props.title || block.props.productId || "Product";
    case "product_grid": return "Product grid";
    case "testimonial": return `Quote · ${block.props.author}`;
    case "icon_row": return "Reasons row";
    case "image": return block.props.alt || "Image";
    case "divider": return "Divider";
    case "spacer": return `Space · ${block.props.height}px`;
    case "custom_html": return block.props.label || "Custom HTML";
    default: return block.type;
  }
}
const cloneBlocks = (blocks: EmailBlock[]) => JSON.parse(JSON.stringify(blocks)) as EmailBlock[];

const preflightEmail = (subject: string, previewText: string, blocks: EmailBlock[]) => {
  const result = preflightEmailDocument({ subject, previewText, blocks });
  return {
    passed: result.passed,
    checks: result.checks.map((check) => ({
      label: check.label,
      ok: check.passed,
      detail: check.detail,
    })),
  };
};

export function EmailStudio({ initialBlocks, initialSubject, initialPreviewText, initialHtml, brandKit, previewVariables, templateId, storeId, templateName, reviewHref, onBack }: {
  initialBlocks: EmailBlock[]; initialSubject: string; initialPreviewText: string; initialHtml: string;
  brandKit?: BrandKit; previewVariables: Record<string, string>; templateId?: string; storeId?: string;
  /** Shown in the Studio top bar. */
  templateName?: string;
  /** Where the existing review/delivery flow continues, when there is one. */
  reviewHref?: string | null;
  /** Overrides the default "go back the way you came". */
  onBack?: () => void;
}) {
  const [blocks, setBlocks] = React.useState<EmailBlock[]>(() => cloneBlocks(initialBlocks));
  const [subject, setSubject] = React.useState(initialSubject);
  const [previewText, setPreviewText] = React.useState(initialPreviewText);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialBlocks[0]?.id ?? null);
  const [html, setHtml] = React.useState(initialHtml);
  const [activeTab, setActiveTab] = React.useState<StudioTab>("ask");
  const [compactPanelOpen, setCompactPanelOpen] = React.useState(false);
  const [outlineOpen, setOutlineOpen] = React.useState(true);
  const [toolsOpen, setToolsOpen] = React.useState(true);
  const askInputRef = React.useRef<HTMLTextAreaElement>(null);
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const [instruction, setInstruction] = React.useState("");
  const [askScope, setAskScope] = React.useState<AskScope>("document");
  const [visualMode, setVisualMode] = React.useState<VisualMode>("creative_concept");
  const [visualSlots, setVisualSlots] = React.useState<VisualSlotDraft[]>([
    { id: "hero", label: "Clean hero", prompt: "" },
    { id: "lifestyle", label: "In use", prompt: "" },
    { id: "crop", label: "Close crop", prompt: "" },
    { id: "backdrop", label: "Campaign backdrop", prompt: "" },
  ]);
  const [visuals, setVisuals] = React.useState<GeneratedVisual[]>([]);
  const [visualFailures, setVisualFailures] = React.useState<VisualFailure[]>([]);
  const [promptError, setPromptError] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = React.useState<string[]>([]);
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [proposalView, setProposalView] = React.useState<"before" | "proposed">("proposed");
  const [dirty, setDirty] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [versions, setVersions] = React.useState<Snapshot[]>([
    { id: "opened", label: "Opened in studio", createdAt: new Date(), blocks: cloneBlocks(initialBlocks), subject: initialSubject, previewText: initialPreviewText },
  ]);
  const [versionCursor, setVersionCursor] = React.useState(0);
  const [codeDraft, setCodeDraft] = React.useState("");
  const [assetUploading, setAssetUploading] = React.useState(false);
  const { toast } = useToast();
  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const effectiveBlocks = proposal && proposalView === "proposed" ? proposal.blocks : blocks;
  const effectiveSubject = proposal && proposalView === "proposed" ? proposal.subject : subject;
  const effectivePreviewText = proposal && proposalView === "proposed" ? proposal.previewText : previewText;
  const preflight = React.useMemo(() => preflightEmail(effectiveSubject, effectivePreviewText, effectiveBlocks), [effectiveSubject, effectivePreviewText, effectiveBlocks]);

  React.useEffect(() => { setCodeDraft(selected ? JSON.stringify(selected, null, 2) : ""); }, [selected]);
  // Selecting a block narrows the next request to it. Widening back out to the
  // whole email stays a deliberate choice, never an inherited one.
  React.useEffect(() => { setAskScope(selectedId ? "block" : "document"); }, [selectedId]);

  /**
   * Cmd/Ctrl+J opens the Studio's OWN Ask Joon.
   *
   * The dashboard binds the same chord to the global panel. On this route that
   * panel does not exist — the Studio layout sits outside its provider — so
   * the chord would otherwise do nothing. It now focuses the Ask Joon a
   * merchant is actually looking at.
   */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || (event.key !== "j" && event.key !== "J")) return;
      event.preventDefault();
      setActiveTab("ask");
      setToolsOpen(true);
      setCompactPanelOpen(true);
      window.requestAnimationFrame(() => askInputRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const creativeAssetsQuery = (trpc.ai as any).listBrandAssets.useQuery(
    { storeId: storeId ?? "" }, { enabled: !!storeId },
  ) as { data?: Array<{ id: string; fileName: string; type: string; url?: string }>; refetch: () => Promise<unknown> };
  const creativeAssets = creativeAssetsQuery.data ?? [];
  const { data: productPage } = (trpc.products as any).list.useQuery(
    { storeId: storeId ?? "", page: 1, limit: 24 },
    { enabled: !!storeId },
  ) as { data?: { products: Array<{ id: string; title: string; description?: string | null; imageUrl?: string | null; price: number; handle: string }> } };
  const { data: storeCollections } = (trpc.products as any).collections.useQuery(
    { storeId: storeId ?? "" }, { enabled: !!storeId },
  ) as { data?: Array<{ id: string; title: string; handle: string; productCount: number }> };
  const boundProductId = selected && selected.type === "product" ? (selected.props.productId || "") : "";
  const { data: productVariants } = (trpc.products as any).variants.useQuery(
    { storeId: storeId ?? "", productId: boundProductId },
    { enabled: !!storeId && !!boundProductId },
  ) as { data?: Array<{ id: string; title: string; price: number }> };
  const durableVersionsQuery = (trpc.templates as any).versions.useQuery(
    { id: templateId ?? "" },
    { enabled: !!templateId },
  ) as { data?: DurableVersion[]; refetch: () => Promise<unknown> };
  const proposalHistoryQuery = (trpc.emails as any).proposalHistory.useQuery(
    { templateId: templateId ?? "" },
    { enabled: !!templateId },
  ) as { data?: ProposalHistoryItem[]; refetch: () => Promise<unknown> };
  const renderMut = (trpc.emails as any).renderPreview.useMutation({
    onSuccess: (data: { html: string }) => setHtml(data.html),
    onError: (error: { message?: string }) => setPromptError(error.message ?? "Preview could not be rendered."),
  });
  const promptMut = (trpc.emails as any).promptEdit.useMutation();
  const resolveProposalMut = (trpc.emails as any).resolveProposal.useMutation();
  const restoreVersionMut = (trpc.templates as any).restoreVersion.useMutation();
  const createAssetUploadMut = (trpc.emails as any).createAssetUpload.useMutation();
  const completeAssetUploadMut = (trpc.emails as any).completeAssetUpload.useMutation();
  const saveMut = (trpc.templates as any).update.useMutation() as { mutate: (input: unknown, opts?: { onSuccess?: () => void; onError?: (error: { message?: string }) => void }) => void; isPending: boolean };
  const renderRef = React.useRef(renderMut); renderRef.current = renderMut;
  const firstRun = React.useRef(Boolean(initialHtml));
  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const timer = window.setTimeout(() => renderRef.current.mutate({ blocks: effectiveBlocks, subject: effectiveSubject, previewText: effectivePreviewText, variables: previewVariables, brandKit, storeId }), 220);
    return () => window.clearTimeout(timer);
  }, [effectiveBlocks, effectiveSubject, effectivePreviewText, previewVariables, brandKit, storeId]);

  const generateVisualsMut = (trpc.emails as any).generateVisuals.useMutation();
  const { data: visualCapabilities } = (trpc.emails as any).visualCapabilities.useQuery(
    { templateId }, { enabled: activeTab === "visuals" },
  ) as { data?: import("./VisualGenerator").VisualCapabilities };

  /** The product the selected block is about, if any — visuals are grounded in it. */
  const blockProductId = selected && (selected.type === "product")
    ? (selected.props.productId || null)
    : (blocks.find((block) => block.type === "product") as any)?.props?.productId ?? null;
  const blockProduct = blockProductId
    ? (productPage?.products ?? []).find((product) => product.id === blockProductId) ?? null
    : null;

  const generateVisuals = () => {
    if (!storeId || generateVisualsMut.isPending) return;
    const slots = visualSlots
      .filter((slot) => slot.prompt.trim())
      .map((slot) => ({
        id: slot.id,
        label: slot.label,
        prompt: slot.prompt,
        purpose: slot.id === "hero" ? "hero_banner" as const
          : slot.id === "lifestyle" ? "product_lifestyle" as const
          : slot.id === "backdrop" ? "background" as const
          : "card" as const,
      }));
    if (!slots.length) return;
    setVisualFailures([]);
    generateVisualsMut.mutate(
      { storeId, templateId, productId: blockProductId ?? undefined, mode: visualMode, slots },
      {
        onSuccess: (data: { assets: GeneratedVisual[]; failures: VisualFailure[] }) => {
          setVisuals(data.assets);
          setVisualFailures(data.failures);
          if (data.assets.length) {
            toast(`${data.assets.length} visual${data.assets.length === 1 ? "" : "s"} ready to choose from.`, "success");
            void creativeAssetsQuery.refetch();
          }
        },
        onError: (error: { message?: string }) => {
          setVisualFailures([{ slotId: "request", reason: error.message ?? "Joon could not generate those visuals." }]);
        },
      },
    );
  };

  /**
   * Put a chosen visual into the selected block. Never applied automatically.
   *
   * Product blocks are deliberately NOT offered. A product block's image is a
   * Shopify fact: the renderer prefers the store's product map over anything on
   * the block, and template enrichment rewrites `imageUrl` on every load. A
   * generated visual placed there showed in preview and was replaced by the
   * store image at delivery — the merchant would approve one picture and Joon
   * would send another. Until there is a renderer-supported editorial image
   * field that does not overwrite the product fact, the answer is no.
   */
  const useVisual = (visual: GeneratedVisual) => {
    if (!selected) { toast("Select an image or hero block first.", "error"); return; }
    if (selected.type === "image") {
      updateBlock({ ...selected, props: { ...selected.props, src: visual.url, alt: visual.label } } as EmailBlock);
    } else if (selected.type === "hero") {
      updateBlock({ ...selected, props: { ...selected.props, bgImageSrc: visual.url } } as EmailBlock);
    } else if (selected.type === "product") {
      toast(
        "A product block always shows the product's own Shopify image. Put this visual in an image or hero block instead.",
        "error",
      );
      return;
    } else {
      toast("That block cannot hold an image. Select an image or hero block.", "error");
      return;
    }
    toast("Visual placed. Nothing is sent until you approve the campaign.", "success");
  };

  /**
   * Bind a product the merchant PICKED. Only the reference is stored — title,
   * price, description and image are resolved from the store at render and
   * send time, so the email cannot drift from what the store actually says.
   */
  const bindProduct = (productId: string) => {
    if (!selected || selected.type !== "product") return;
    updateBlock({ ...selected, props: { ...selected.props, productId, source: "manual" } } as EmailBlock);
    toast("Product bound. Its details come from your store.", "success");
  };

  /** Bind a variant of the already-chosen product, or clear it. */
  const bindVariant = (variantId: string | null) => {
    if (!selected || selected.type !== "product") return;
    const props = { ...selected.props } as Record<string, unknown>;
    if (variantId) props["variantId"] = variantId;
    else delete props["variantId"];
    updateBlock({ ...selected, props } as EmailBlock);
  };

  /**
   * Bind a collection to a grid, or clear it.
   *
   * This is a LIVE binding: the grid renders whatever the collection holds at
   * send time. Preview, the approval snapshot and delivery all resolve it the
   * same way, so what a merchant approves is what is sent.
   */
  const bindCollection = (collectionId: string | null) => {
    if (!selected || selected.type !== "product_grid") return;
    const props = { ...selected.props } as Record<string, unknown>;
    if (collectionId) props["collectionId"] = collectionId;
    else delete props["collectionId"];
    updateBlock({ ...selected, props } as EmailBlock);
    toast(collectionId ? "Collection bound. It stays live until send." : "Collection unbound.", "success");
  };

  /** Add or remove a product from a grid. Only ids are stored. */
  const toggleGridProduct = (productId: string) => {
    if (!selected || selected.type !== "product_grid") return;
    const current = selected.props.productIds ?? [];
    const next = current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId];
    updateBlock({ ...selected, props: { ...selected.props, productIds: next, source: "manual" } } as EmailBlock);
  };

  /** Append a personalization token to the selected block's own text field. */
  const insertToken = (text: string) => {
    if (!selected) return;
    const field = selected.type === "text" ? "html"
      : selected.type === "hero" ? "heading"
      : selected.type === "button" ? "text"
      : selected.type === "footer" ? "text"
      : selected.type === "testimonial" ? "quote"
      : null;
    if (!field) return;
    const props = selected.props as Record<string, unknown>;
    const current = typeof props[field] === "string" ? (props[field] as string) : "";
    updateBlock({ ...selected, props: { ...props, [field]: `${current}${current ? " " : ""}${text}` } } as EmailBlock);
  };

  const updateBlock = (next: EmailBlock) => {
    const parsed = emailBlockSchema.safeParse(next);
    if (!parsed.success) { toast(parsed.error.issues[0]?.message ?? "That block is not valid.", "error"); return; }
    setBlocks((current) => current.map((block) => block.id === next.id ? parsed.data as EmailBlock : block)); setDirty(true);
  };
  const move = (blockId: string, direction: -1 | 1) => {
    setBlocks((current) => { const index = current.findIndex((block) => block.id === blockId); const destination = index + direction; if (index < 0 || destination < 0 || destination >= current.length) return current; const next = [...current]; [next[index], next[destination]] = [next[destination]!, next[index]!]; return next; }); setDirty(true);
  };
  const remove = (blockId: string) => {
    setBlocks((current) => { const next = current.filter((block) => block.id !== blockId); if (selectedId === blockId) setSelectedId(next[0]?.id ?? null); return next; }); setDirty(true);
  };
  const add = (type: EmailBlockType) => {
    const block = createDefaultBlock(type, newId(type)); setBlocks((current) => [...current, block]); setSelectedId(block.id); setActiveTab(type === "custom_html" ? "code" : "inspect"); setShowAdd(false); setCompactPanelOpen(true); setDirty(true);
  };
  const createCheckpoint = (label: string, next?: { blocks: EmailBlock[]; subject: string; previewText: string }) => {
    const snapshot: Snapshot = { id: `v-${Date.now()}`, label, createdAt: new Date(), blocks: cloneBlocks(next?.blocks ?? blocks), subject: next?.subject ?? subject, previewText: next?.previewText ?? previewText };
    setVersions((current) => [...current.slice(0, versionCursor + 1), snapshot]); setVersionCursor((current) => current + 1);
  };
  const restoreVersion = (index: number) => {
    const version = versions[index]; if (!version) return;
    setBlocks(cloneBlocks(version.blocks)); setSubject(version.subject); setPreviewText(version.previewText); setSelectedId(version.blocks[0]?.id ?? null); setVersionCursor(index); setProposal(null); setDirty(true);
  };
  const saveDraft = () => {
    if (!templateId) return;
    const validated = emailBlocksSchema.safeParse(blocks);
    if (!validated.success) { toast(validated.error.issues[0]?.message ?? "This email contains an invalid block.", "error"); return; }
    saveMut.mutate({ id: templateId, subject, previewText, blocks: validated.data }, {
      onSuccess: () => { createCheckpoint("Saved version"); setDirty(false); setSavedAt(new Date()); void durableVersionsQuery.refetch(); toast("Saved as a recoverable version.", "success"); },
      onError: (error) => toast(error.message ?? "Could not save this email.", "error"),
    });
  };
  const askJoon = (text = instruction, scope?: "subject" | "copy" | "visual" | "tone") => {
    if (!text.trim() || promptMut.isPending) return; setPromptError(null);
    const editScope = askScope === "block" && selectedId
      ? { kind: "block" as const, blockId: selectedId }
      : askScope === "envelope"
      ? { kind: "envelope" as const }
      : { kind: "document" as const };
    promptMut.mutate({ instruction: text, blocks, subject, previewText, scope, editScope, storeId, templateId, selectedBlockId: selectedId ?? undefined, sourceAssetIds: selectedAssetIds }, {
      onSuccess: (data: { applied: boolean; blocks: EmailBlock[]; subject?: string; previewText?: string; proposalId?: string; error?: string }) => {
        if (!data.applied) { setPromptError(data.error ?? "Joon could not produce a safe change."); return; }
        setProposal({ id: data.proposalId, blocks: data.blocks, subject: data.subject ?? subject, previewText: data.previewText ?? previewText, instruction: text, createdAt: new Date() }); setProposalView("proposed"); setInstruction(""); void proposalHistoryQuery.refetch();
      },
      onError: (error: { message?: string }) => setPromptError(error.message ?? "Joon is unavailable right now."),
    });
  };
  const acceptProposal = () => {
    if (!proposal || resolveProposalMut.isPending) return;
    const apply = () => { createCheckpoint(`Joon · ${proposal.instruction}`, proposal); setBlocks(cloneBlocks(proposal.blocks)); setSubject(proposal.subject); setPreviewText(proposal.previewText); setSelectedId(proposal.blocks.some((block) => block.id === selectedId) ? selectedId : proposal.blocks[0]?.id ?? null); setProposal(null); setDirty(!proposal.id); setSavedAt(proposal.id ? new Date() : savedAt); if (proposal.id) { void durableVersionsQuery.refetch(); void proposalHistoryQuery.refetch(); } };
    if (!proposal.id) { apply(); return; }
    resolveProposalMut.mutate({ proposalId: proposal.id, decision: "accepted" }, { onSuccess: apply, onError: (error: { message?: string }) => toast(error.message ?? "Could not accept this proposal.", "error") });
  };
  const rejectProposal = () => {
    if (!proposal || resolveProposalMut.isPending) return;
    if (!proposal.id) { setProposal(null); return; }
    resolveProposalMut.mutate({ proposalId: proposal.id, decision: "rejected" }, { onSuccess: () => { setProposal(null); void proposalHistoryQuery.refetch(); }, onError: (error: { message?: string }) => toast(error.message ?? "Could not reject this proposal.", "error") });
  };
  const applyCode = () => {
    if (!selected) return;
    try { const parsed = emailBlockSchema.parse(JSON.parse(codeDraft)) as EmailBlock; if (parsed.id !== selected.id) throw new Error("The block ID cannot change in code mode."); updateBlock(parsed); toast("Code applied to the selected block.", "success"); }
    catch (error) { toast(error instanceof Error ? error.message : "The block JSON is invalid.", "error"); }
  };
  const restoreDurableVersion = (versionId: string) => {
    if (!templateId || restoreVersionMut.isPending) return;
    restoreVersionMut.mutate({ templateId, versionId }, {
      onSuccess: (data: any) => {
        const nextBlocks = data.template.blocks as EmailBlock[];
        setBlocks(cloneBlocks(nextBlocks)); setSubject(data.template.subject); setPreviewText(data.template.previewText ?? ""); setSelectedId(nextBlocks[0]?.id ?? null); setProposal(null); setDirty(false); setSavedAt(new Date()); void durableVersionsQuery.refetch(); toast("Restored as a new version.", "success");
      },
      onError: (error: { message?: string }) => toast(error.message ?? "Could not restore this version.", "error"),
    });
  };
  const uploadAsset = async (file: File) => {
    if (!storeId || assetUploading) {
      if (!storeId) toast("Choose a store before uploading an email asset.", "error");
      return;
    }
    setAssetUploading(true);
    try {
      const upload = await createAssetUploadMut.mutateAsync({ storeId, fileName: file.name, mimeType: file.type, size: file.size });
      const response = await fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
      const asset = await completeAssetUploadMut.mutateAsync({ storeId, key: upload.key, fileName: file.name, type: "reference_image" });
      setSelectedAssetIds((current) => [...new Set([...current, asset.id])]);
      await creativeAssetsQuery.refetch();
      toast("Image added to this store’s asset library.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not upload this image.", "error");
    } finally {
      setAssetUploading(false);
    }
  };

  // The root fills its parent rather than subtracting a fixed 6.25rem for a
  // dashboard top bar the Studio route no longer has — that allowance was
  // leaving ~100px of dead space under the editor. The card border and shadow
  // went with it: this is a workspace, not a card on a page.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FFFDF8] text-foreground">
      <StudioTopBar
        name={templateName ?? "Untitled email"}
        state={dirty ? "draft" : "saved"}
        canUndo={versionCursor > 0}
        canRedo={versionCursor < versions.length - 1}
        onUndo={() => restoreVersion(Math.max(0, versionCursor - 1))}
        onRedo={() => restoreVersion(Math.min(versions.length - 1, versionCursor + 1))}
        onPreview={() => renderMut.mutate({ blocks: effectiveBlocks, subject: effectiveSubject, previewText: effectivePreviewText, variables: previewVariables, storeId })}
        onSave={saveDraft}
        saving={saveMut.isPending}
        reviewHref={reviewHref ?? null}
        onAddBlock={() => setShowAdd((value) => !value)}
        onOpenTools={() => setCompactPanelOpen(true)}
        onBack={onBack ?? (() => router.back())}
      />
      {proposal ? <ProposalBar proposal={proposal} view={proposalView} setView={setProposalView} reject={rejectProposal} accept={acceptProposal} pending={resolveProposalMut.isPending} /> : null}
      {showAdd ? <div className="absolute right-3 top-[68px] z-50 w-56 overflow-hidden rounded-xl border border-border bg-[var(--surface,#FFFDF8)] shadow-xl xl:hidden"><BlockPicker onAdd={add} /></div> : null}

      <div className="relative flex min-h-0 flex-1">
        <aside
          aria-label="Email outline"
          aria-hidden={!isDesktop || !outlineOpen}
          className={cn(
            // Width animates and the pane stays in flow — the same shape the
            // app sidebar uses. Nothing toggles `display`, so nothing can lose
            // its column and wrap underneath.
            "min-h-0 shrink-0 flex-col overflow-hidden bg-[#F4F2EC] transition-[width] duration-200",
            isDesktop ? "flex" : "hidden",
            // A collapsed pane leaves no 1px border line behind.
            isDesktop && outlineOpen && "border-r border-border",
          )}
          style={{ width: isDesktop && outlineOpen ? 220 : 0 }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2"><div><p className="text-[13px] font-medium">Content</p><p className="text-[12px] text-muted-foreground">{blocks.length} blocks</p></div><IconButton label="Add block" onClick={() => setShowAdd((value) => !value)}><Plus className="h-4 w-4" /></IconButton></div>
          <button type="button" onClick={() => setOutlineOpen(false)} aria-expanded={true} className="mx-3 mt-2 shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground outline-none hover:bg-[#FFFDF8] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]">Hide outline</button>
          {showAdd ? <BlockPicker onAdd={add} /> : null}
          <div className="min-h-0 flex-1 overflow-y-auto"><BlockList blocks={blocks} selectedId={selectedId} onSelect={(blockId) => { setSelectedId(blockId); setActiveTab("inspect"); }} onMove={move} onRemove={remove} blockTitle={blockTitle} /></div>
        </aside>

        {isDesktop && !outlineOpen ? (
          <button
            type="button"
            onClick={() => setOutlineOpen(true)}
            aria-expanded={false}
            className="absolute left-2 top-2 z-20 rounded-lg border border-border bg-[#FFFDF8] px-2 py-1 text-[11px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
          >
            Show outline
          </button>
        ) : null}
        {isDesktop && !toolsOpen ? (
          <button
            type="button"
            onClick={() => setToolsOpen(true)}
            aria-expanded={false}
            className="absolute right-2 top-2 z-20 rounded-lg border border-border bg-[#FFFDF8] px-2 py-1 text-[11px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
          >
            Show tools
          </button>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F4F2EC] p-2">
          <div className="mb-2 grid shrink-0 gap-2 rounded-lg border border-border bg-[#FFFDF8] p-2 md:grid-cols-2">
            <EnvelopeField label="Subject" value={effectiveSubject} readOnly={!!proposal} onChange={(value) => { setSubject(value); setDirty(true); }} />
            <EnvelopeField label="Inbox preview" value={effectivePreviewText} readOnly={!!proposal} placeholder="The line people see beside the subject" onChange={(value) => { setPreviewText(value); setDirty(true); }} />
          </div>
          <div className="min-h-0 flex-1"><EmailPreviewFrame html={html} isLoading={renderMut.isPending} selectedBlockId={selectedId} onSelectBlock={(blockId) => { if (proposalView === "before") return; setSelectedId(blockId); setActiveTab("inspect"); setCompactPanelOpen(true); }} /></div>
        </main>

        {compactPanelOpen ? <button type="button" aria-label="Close email tools" onClick={() => setCompactPanelOpen(false)} className="fixed inset-0 z-30 bg-black/20 xl:hidden" /> : null}
        <aside
          aria-label="Email tools"
          className={cn(
            "min-h-0 flex-col border-border bg-[#FFFDF8]",
            isDesktop
              // Desktop: an in-flow column whose width animates to nothing.
              ? cn("flex shrink-0 overflow-hidden transition-[width] duration-200", toolsOpen && "border-l")
              // Below xl: a drawer over the canvas, which is what there is room for.
              : compactPanelOpen
                ? "fixed inset-x-3 bottom-3 top-20 z-40 flex overflow-hidden rounded-xl border shadow-2xl"
                : "hidden",
          )}
          style={isDesktop ? { width: toolsOpen ? 360 : 0 } : undefined}
        >
          <button type="button" onClick={() => setCompactPanelOpen(false)} className="absolute right-2 top-2 z-10 rounded-lg border border-border bg-[#FFFDF8] p-1.5 text-muted-foreground xl:hidden" aria-label="Close tools"><X className="h-4 w-4" /></button>

          <div role="tablist" aria-label="Email tools" className="shrink-0 border-b border-border bg-[#ECE9E1] p-1">
            {/*
              Three primary tabs are the whole everyday loop: look at a block,
              give it real store data, or ask Joon about it. Versions, code and
              preflight are real but occasional, so they sit behind a divider at
              a smaller weight rather than competing for the same attention.
            */}
            <div className="grid grid-cols-4">
              <StudioTabButton active={activeTab === "inspect"} label="Edit" icon={<Inspect className="h-4 w-4" />} onClick={() => setActiveTab("inspect")} />
              <StudioTabButton active={activeTab === "shopify"} label="Shopify" icon={<ShoppingBag className="h-4 w-4" />} onClick={() => setActiveTab("shopify")} />
              <StudioTabButton active={activeTab === "ask"} label="Ask Joon" icon={<MessageSquareText className="h-4 w-4" />} onClick={() => setActiveTab("ask")} />
              <StudioTabButton active={activeTab === "visuals"} label="Visuals" icon={<ImagePlus className="h-4 w-4" />} onClick={() => setActiveTab("visuals")} />
            </div>
            <div className="mt-1 flex items-center justify-center gap-1 border-t border-border/60 pt-1">
              <SecondaryTab active={activeTab === "preflight"} label="Checks" icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={() => setActiveTab("preflight")} />
              <SecondaryTab active={activeTab === "versions"} label="Versions" icon={<FileClock className="h-3.5 w-3.5" />} onClick={() => setActiveTab("versions")} />
              <SecondaryTab active={activeTab === "code"} label="Code" icon={<Code2 className="h-3.5 w-3.5" />} onClick={() => setActiveTab("code")} />
              <button type="button" onClick={() => setToolsOpen(false)} aria-label="Hide tools panel" aria-expanded={true} title="Hide tools panel" className={cn("ml-1 rounded-md p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2D4F9E]", isDesktop ? "inline-flex" : "hidden")}><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === "ask" ? <AskPanel inputRef={askInputRef} selected={selected} scope={askScope} setScope={setAskScope} instruction={instruction} setInstruction={setInstruction} pending={promptMut.isPending} error={promptError} assets={creativeAssets} selectedAssetIds={selectedAssetIds} setSelectedAssetIds={setSelectedAssetIds} onAsk={askJoon} onUpload={uploadAsset} uploading={assetUploading} history={proposalHistoryQuery.data ?? []} /> : null}
            {activeTab === "inspect" ? <InspectorPanel selected={selected} updateBlock={updateBlock} assets={creativeAssets} products={productPage?.products ?? []} /> : null}
            {activeTab === "shopify" ? <ShopifyDataPanel selected={selected} products={(productPage?.products ?? []) as any} collections={(storeCollections ?? []) as any} variants={(productVariants ?? []) as any} storeConnected={!!storeId} onBindProduct={bindProduct} onBindVariant={bindVariant} onToggleGridProduct={toggleGridProduct} onBindCollection={bindCollection} onInsertToken={insertToken} /> : null}
            {activeTab === "visuals" ? <VisualGenerator mode={visualMode} setMode={setVisualMode} slots={visualSlots} setSlots={setVisualSlots} productTitle={blockProduct?.title ?? null} productHasImage={Boolean(blockProduct?.imageUrl)} capabilities={visualCapabilities ?? null} results={visuals} failures={visualFailures} pending={generateVisualsMut.isPending} onGenerate={generateVisuals} onUseAsset={useVisual} /> : null}
            {activeTab === "versions" ? <VersionsPanel versions={versions} cursor={versionCursor} restore={restoreVersion} durableVersions={durableVersionsQuery.data ?? []} restoreDurable={restoreDurableVersion} restoring={restoreVersionMut.isPending} /> : null}
            {activeTab === "code" ? <CodePanel selected={selected} code={codeDraft} setCode={setCodeDraft} apply={applyCode} /> : null}
            {activeTab === "preflight" ? <PreflightPanel preflight={preflight} /> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ProposalBar({ proposal, view, setView, reject, accept, pending }: { proposal: Proposal; view: "before" | "proposed"; setView: (view: "before" | "proposed") => void; reject: () => void; accept: () => void; pending: boolean }) {
  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--attention,#C99116)]/30 bg-[var(--attention-soft,#FFF0B8)] px-5 py-2.5"><div className="flex min-w-0 items-center gap-3"><Sparkles className="h-4 w-4 shrink-0 text-[var(--attention,#C99116)]" /><p className="truncate text-[13px]"><span className="font-medium">Joon proposed:</span> {proposal.instruction}</p><div className="flex rounded-lg border border-[var(--attention,#C99116)]/40 bg-white/50 p-0.5">{(["before", "proposed"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={cn("rounded-md px-2.5 py-1 text-[12px] capitalize", view === item && "bg-white shadow-sm")}>{item}</button>)}</div></div><div className="flex items-center gap-2"><button type="button" onClick={reject} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-1.5 text-[12px] disabled:opacity-40"><X className="h-3.5 w-3.5" />Reject</button><button type="button" onClick={accept} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-[#17204D] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept change</button></div></div>;
}

function AskPanel({ inputRef, selected, scope, setScope, instruction, setInstruction, pending, error, assets, selectedAssetIds, setSelectedAssetIds, onAsk, onUpload, uploading, history }: { inputRef: React.RefObject<HTMLTextAreaElement | null>; selected: EmailBlock | null; scope: AskScope; setScope: (value: AskScope) => void; instruction: string; setInstruction: (value: string) => void; pending: boolean; error: string | null; assets: Array<{ id: string; fileName: string; type: string }>; selectedAssetIds: string[]; setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>; onAsk: (text?: string, scope?: "subject" | "copy" | "visual" | "tone") => void; onUpload: (file: File) => void; uploading: boolean; history: ProposalHistoryItem[] }) {
  const suggestions = selected ? ["Make this clearer", "Try a stronger visual", "Shorten this block", "Match our brand voice"] : ["Make the email more visual", "Tighten the whole email", "Try a warmer direction", "Create a fresh layout"];
  return <div className="flex min-h-full flex-col"><div className="p-4"><PanelHeading eyebrow="Ask Joon" title={selected ? blockTitle(selected) : "This email"} description="Every result arrives as a proposal you accept or reject. Nothing changes until you do." /><ScopeChooser scope={scope} setScope={setScope} selectedTitle={selected ? blockTitle(selected) : null} />{history.length ? <div className="mt-5 space-y-2 border-l border-border pl-3">{history.slice(-8).map((item) => <div key={item.id} className="rounded-r-xl bg-[#F4F2EC] p-2.5"><div className="flex items-start justify-between gap-2"><p className="text-[12px] leading-5">{item.instruction}</p><span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px]", item.status === "accepted" ? "bg-[var(--success-soft,#E5F4EE)] text-[#157858]" : item.status === "rejected" ? "bg-[var(--risk-soft,#FAE8E4)] text-[var(--risk,#B95849)]" : "bg-[var(--attention-soft,#FFF0B8)] text-foreground")}>{item.status}</span></div><p className="mt-1 text-[10px] text-muted-foreground">Joon prepared a reviewable change · {new Date(item.createdAt).toLocaleString()}</p></div>)}</div> : <div className="mt-5 rounded-xl border border-border bg-[#F4F2EC] p-3"><div className="flex gap-2.5"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#17204D] text-[11px] font-medium text-white">J</div><p className="text-[13px] leading-5">Tell me what should change. I’ll keep the current version intact and show you the proposal before anything is applied.</p></div></div>}<div className="mt-3 flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onAsk(suggestion)} disabled={pending} className="rounded-full border border-border px-2.5 py-1 text-[12px] hover:border-[var(--attention,#C99116)] hover:bg-[var(--attention-soft,#FFF0B8)] disabled:opacity-40">{suggestion}</button>)}</div><div className="mt-5"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-[12px] font-medium">Reference assets</p><label className="cursor-pointer rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-[#F4F2EC]"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.currentTarget.value = ""; }} />{uploading ? "Uploading…" : "+ Upload"}</label></div><div className="flex flex-wrap gap-1.5">{assets.map((asset) => { const active = selectedAssetIds.includes(asset.id); return <button key={asset.id} type="button" onClick={() => setSelectedAssetIds((current) => active ? current.filter((id) => id !== asset.id) : [...current, asset.id])} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]", active ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)]" : "border-border")}><ImagePlus className="h-3.5 w-3.5" />{asset.fileName}</button>; })}{!assets.length ? <p className="text-[12px] text-muted-foreground">Upload a product or campaign reference, then ask Joon to use or transform it.</p> : null}</div></div></div><div className="sticky bottom-0 mt-auto border-t border-border bg-[var(--surface,#FFFDF8)] p-3"><div className="rounded-xl border border-border bg-white p-2 focus-within:border-[var(--evidence,#2D4F9E)]"><textarea ref={inputRef} value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onAsk(); } }} rows={4} placeholder={scope === "block" && selected ? `Ask Joon about “${blockTitle(selected)}”…` : scope === "envelope" ? "Ask Joon about the subject or inbox preview…" : "Ask Joon about the whole email…"} className="w-full resize-none bg-transparent px-1 text-[14px] leading-5 outline-none" /><div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Enter to propose · Shift Enter for a new line</span><button type="button" onClick={() => onAsk()} disabled={pending || !instruction.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#17204D] text-white disabled:opacity-40" aria-label="Ask Joon">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div></div>{error ? <p className="mt-2 text-[12px] text-[var(--risk,#B95849)]">{error}</p> : null}</div></div>;
}

function InspectorPanel({ selected, updateBlock, assets, products }: { selected: EmailBlock | null; updateBlock: (block: EmailBlock) => void; assets: Array<{ id: string; fileName: string; type: string; url?: string }>; products: Array<{ id: string; title: string; description?: string | null; imageUrl?: string | null; price: number; handle: string }> }) {
  const applyAsset = (url: string) => {
    if (!selected) return;
    if (selected.type === "image") updateBlock({ ...selected, props: { ...selected.props, src: url } });
    else if (selected.type === "hero") updateBlock({ ...selected, props: { ...selected.props, bgImageSrc: url } });
    else if (selected.type === "product") updateBlock({ ...selected, props: { ...selected.props, imageUrl: url } });
  };
  const bindProduct = (product: (typeof products)[number]) => {
    if (!selected) return;
    if (selected.type === "product") updateBlock({ ...selected, props: { ...selected.props, productId: product.id, source: "manual", title: product.title, description: product.description ?? undefined, imageUrl: product.imageUrl ?? undefined, price: product.price } });
    else if (selected.type === "product_grid") updateBlock({ ...selected, props: { ...selected.props, source: "manual", productIds: [...new Set([...selected.props.productIds, product.id])] } });
  };
  const supportsAssets = selected?.type === "image" || selected?.type === "hero" || selected?.type === "product";
  const supportsProducts = selected?.type === "product" || selected?.type === "product_grid";
  return <div className="p-4"><PanelHeading eyebrow="Selected element" title={selected ? blockTitle(selected) : "Nothing selected"} description={selected ? `Editing ${selected.type.replace("_", " ")} · click the canvas to choose another element.` : "Click any part of the email canvas."} />{supportsAssets && assets.length ? <div className="mt-5"><p className="mb-2 text-[12px] font-medium">Asset library</p><div className="grid grid-cols-3 gap-2">{assets.filter((asset) => asset.url).slice(0, 9).map((asset) => <button key={asset.id} type="button" onClick={() => applyAsset(asset.url!)} className="group overflow-hidden rounded-lg border border-border bg-[#F4F2EC] text-left"><img src={asset.url} alt={asset.fileName} className="aspect-square w-full object-cover" /><span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground group-hover:text-foreground">{asset.fileName}</span></button>)}</div></div> : null}{supportsProducts && products.length ? <div className="mt-5"><p className="mb-2 text-[12px] font-medium">Store products</p><div className="max-h-64 space-y-1 overflow-y-auto">{products.map((product) => <button key={product.id} type="button" onClick={() => bindProduct(product)} className="flex w-full items-center gap-2 rounded-lg border border-transparent p-1.5 text-left hover:border-border hover:bg-[#F4F2EC]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="h-9 w-9 rounded-md bg-[var(--surface-soft,#ECE9E1)]" />}<div className="min-w-0"><p className="truncate text-[12px] font-medium">{product.title}</p><p className="text-[11px] text-muted-foreground">{product.price.toLocaleString()}</p></div></button>)}</div></div> : null}<div className="mt-5"><BlockEditor block={selected} onUpdate={updateBlock} /></div></div>;
}
function VersionsPanel({ versions, cursor, restore, durableVersions, restoreDurable, restoring }: { versions: Snapshot[]; cursor: number; restore: (index: number) => void; durableVersions: DurableVersion[]; restoreDurable: (id: string) => void; restoring: boolean }) { return <div className="p-4"><PanelHeading eyebrow="Recoverable history" title="Versions" description="Manual and Joon changes share one history. Restoring creates a new version; nothing is erased." />{durableVersions.length ? <><p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Saved across sessions</p><div className="space-y-2">{durableVersions.map((version) => <button key={version.id} type="button" disabled={restoring} onClick={() => restoreDurable(version.id)} className="w-full rounded-xl border border-border p-3 text-left hover:bg-[#F4F2EC] disabled:opacity-40"><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium">Version {version.sequence} · {version.source}</span><span className="text-[11px] text-muted-foreground">{new Date(version.createdAt).toLocaleDateString()}</span></div><p className="mt-1 text-[12px] text-muted-foreground">{version.note ?? "Saved email artifact"}</p></button>)}</div></> : null}<p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">This session</p><div className="space-y-2">{[...versions].reverse().map((version, reverseIndex) => { const index = versions.length - reverseIndex - 1; return <button key={version.id} type="button" onClick={() => restore(index)} className={cn("w-full rounded-xl border p-3 text-left", index === cursor ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)]" : "border-border hover:bg-[#F4F2EC]")}><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium">{version.label}</span><span className="text-[11px] text-muted-foreground">{version.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><p className="mt-1 text-[12px] text-muted-foreground">{version.blocks.length} blocks · {version.subject || "No subject"}</p></button>; })}</div></div>; }
function CodePanel({ selected, code, setCode, apply }: { selected: EmailBlock | null; code: string; setCode: (value: string) => void; apply: () => void }) { return <div className="p-4"><PanelHeading eyebrow="Structured code" title={selected ? blockTitle(selected) : "Select a block"} description="Edit the selected block as validated JSON. Use a Custom HTML block for precise email-safe markup." /><textarea value={code} onChange={(event) => setCode(event.target.value)} disabled={!selected} spellCheck={false} className="mt-5 min-h-[430px] w-full resize-y rounded-xl border border-border bg-[#171717] p-3 font-mono text-[12px] leading-5 text-[#F4F2EC] outline-none focus:border-[var(--attention,#C99116)] disabled:opacity-40" /><button type="button" onClick={apply} disabled={!selected} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17204D] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"><Code2 className="h-4 w-4" />Apply code</button></div>; }
function PreflightPanel({ preflight }: { preflight: ReturnType<typeof preflightEmail> }) { return <div className="p-4"><PanelHeading eyebrow="Exact artifact" title={`${preflight.passed} of ${preflight.checks.length} checks pass`} description="These checks run against the same structured email used for preview and delivery." /><div className="mt-5 space-y-2">{preflight.checks.map((check) => <div key={check.label} className="flex gap-3 rounded-xl border border-border p-3"><span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", check.ok ? "bg-[var(--success-soft,#E5F4EE)] text-[#157858]" : "bg-[var(--risk-soft,#FAE8E4)] text-[var(--risk,#B95849)]")}>{check.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span><div><p className="text-[13px] font-medium">{check.label}</p><p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{check.detail}</p></div></div>)}</div><div className="mt-4 rounded-xl border border-[var(--evidence,#2D4F9E)]/30 bg-[var(--evidence-soft,#E9EFFF)] p-3 text-[12px] leading-5"><strong>Approval happens on the campaign.</strong> Saving here creates the email version; campaign approval freezes this version with its audience, offer and delivery plan.</div></div>; }

function BlockPicker({ onAdd }: { onAdd: (type: EmailBlockType) => void }) { return <div className="border-b border-border bg-[var(--surface,#FFFDF8)] p-2">{ADDABLE.map((item) => <button key={item.type} type="button" onClick={() => onAdd(item.type)} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-[var(--attention-soft,#FFF0B8)]"><Plus className="h-3 w-3" />{item.label}</button>)}</div>; }
function EnvelopeField({ label, value, readOnly, placeholder, onChange }: { label: string; value: string; readOnly?: boolean; placeholder?: string; onChange: (value: string) => void }) { return <label className="min-w-0"><span className="mb-1 block text-[12px] font-medium text-muted-foreground">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} placeholder={placeholder} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[14px] outline-none focus:border-[var(--evidence,#2D4F9E)] read-only:opacity-70" /></label>; }
function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--evidence,#2D4F9E)]">{eyebrow}</p><h2 className="mt-1 text-[19px] font-medium tracking-[-0.01em]">{title}</h2><p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p></div>; }
function StudioTabButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} title={label} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition-colors", active ? "bg-[var(--surface,#FFFDF8)] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{icon}<span className="truncate">{label}</span></button>; }
/** A demoted tool: real, but not part of the everyday loop. */
function SecondaryTab({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E]",
        active ? "bg-white font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) { return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-lg border border-border bg-[var(--surface,#FFFDF8)] p-2 text-muted-foreground hover:text-foreground disabled:opacity-30">{children}</button>; }
