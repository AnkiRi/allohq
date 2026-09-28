"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check, Code2, Loader2,
  PanelLeft, PanelLeftClose, Plus, Sparkles, X,
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
import { AssetLibrary, type Library, type LibraryItem } from "./AssetLibrary";
import { useIsDesktop } from "@/lib/use-breakpoint";
import { bindProductToBlock } from "@/lib/product-binding";
import { BlockList } from "./BlockList";
import { StudioTopBar } from "./StudioTopBar";
import { type AskScope } from "./AskScope";
import { type VisualProposal } from "./VisualProposalCard";
import { AskPanel, type ProposalHistoryItem } from "./StudioAskPanel";
import { VersionsPanel, type DurableVersion } from "./StudioVersions";
import { ShopifyDataPanel } from "./ShopifyDataPanel";
import { VisualGenerator, type GeneratedVisual, type VisualFailure, type VisualMode, type VisualSlotDraft } from "./VisualGenerator";
import { VisualActions } from "./VisualActions";
import { BlockEditor } from "./BlockEditor";
import { EmailPreviewFrame } from "./EmailPreviewFrame";
import { placeUploadedImage } from "./upload-placement";
import { placeProposalVisual } from "./visual-proposal-placement";
import { proposalPreviewState } from "./proposal-preview";
import { countStudioDraftChanges, matchingStudioVersion, type StudioDraftContent } from "./studio-draft-state";
import { hasCopyAssistance, productReferenceId, scrollStudioPanel, studioContentBlocks } from "./studio-block-controls";

type StudioTab = "ask" | "inspect" | "shopify" | "visuals" | "versions" | "code" | "preflight";
type Snapshot = { id: string; label: string; createdAt: Date; blocks: EmailBlock[]; subject: string; previewText: string };
type Proposal = { id?: string; blocks: EmailBlock[]; subject: string; previewText: string; instruction: string; createdAt: Date; baseSignature: string; stale?: boolean };
const EMPTY_DURABLE_VERSIONS: DurableVersion[] = [];
type PendingProposal = { id: string; instruction: string; createdAt: string | Date; stale: boolean; candidate: { blocks: EmailBlock[]; envelope: { subject: string; previewText: string } } };

let idCounter = 0;
const newId = (type: string) => `${type}-${Date.now().toString(36)}-${idCounter++}`;
const ADDABLE: { type: EmailBlockType; label: string }[] = [
  { type: "hero", label: "Hero" }, { type: "text", label: "Text" },
  { type: "image", label: "Image" }, { type: "button", label: "Button" },
  { type: "product", label: "Product" }, { type: "product_grid", label: "Product grid" },
  { type: "testimonial", label: "Testimonial" }, { type: "icon_row", label: "Reasons" },
  { type: "divider", label: "Divider" }, { type: "spacer", label: "Spacer" },
  { type: "countdown", label: "Countdown" },
  { type: "custom_html", label: "Custom HTML" },
];

/**
 * The name for a block in the outline.
 *
 * A product block's title is deliberately not stored on the block — it is
 * resolved from the store so it can never go stale. That left the outline
 * saying "Product · picked" the moment a merchant switched product, which is
 * worse than the name they just chose. Resolving from the same store data the
 * picker used gives the live title without reintroducing the stale copy.
 */
function blockTitle(block: EmailBlock, products?: Array<{ id: string; title: string }>): string {
  switch (block.type) {
    case "hero": return block.props.heading || "Hero";
    case "text": return block.props.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) || "Text";
    case "button": return block.props.text || "Button";
    // Not the raw id: stripping a replaced product's title leaves nothing to
    // show, and "prod_01H9X" is worse than saying what kind of block it is.
    case "product": {
      const fromStore = block.props.productId
        ? products?.find((product) => product.id === block.props.productId)?.title
        : undefined;
      return fromStore || block.props.title || (block.props.productId ? "Product · picked" : "Product");
    }
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

export function EmailStudio({ initialBlocks, initialSubject, initialPreviewText, initialHtml, initialSavedVersionNumber, brandKit, previewVariables, templateId, storeId, templateName, reviewHref, backLabel, onBack }: {
  initialBlocks: EmailBlock[]; initialSubject: string; initialPreviewText: string; initialHtml: string;
  initialSavedVersionNumber?: number | null;
  brandKit?: BrandKit; previewVariables: Record<string, string>; templateId?: string; storeId?: string;
  /** Shown in the Studio top bar. */
  templateName?: string;
  /** Where the existing review/delivery flow continues, when there is one. */
  reviewHref?: string | null;
  backLabel?: string;
  /** Overrides the default "go back the way you came". */
  onBack?: () => void;
}) {
  const [blocks, setBlocks] = React.useState<EmailBlock[]>(() => cloneBlocks(studioContentBlocks(initialBlocks)));
  const [subject, setSubject] = React.useState(initialSubject);
  const [previewText, setPreviewText] = React.useState(initialPreviewText);
  const [savedDraft, setSavedDraft] = React.useState<StudioDraftContent>(() => ({
    blocks: cloneBlocks(studioContentBlocks(initialBlocks)), subject: initialSubject, previewText: initialPreviewText,
  }));
  const [lastSavedVersionNumber, setLastSavedVersionNumber] = React.useState<number | null>(initialSavedVersionNumber ?? null);
  const draftContent = React.useMemo(() => ({ blocks, subject, previewText }), [blocks, subject, previewText]);
  const unsavedChangeCount = React.useMemo(() => countStudioDraftChanges(savedDraft, draftContent), [savedDraft, draftContent]);
  const dirty = unsavedChangeCount > 0;
  const draftSignature = JSON.stringify({ blocks, subject, previewText });
  const [selectedId, setSelectedId] = React.useState<string | null>(studioContentBlocks(initialBlocks)[0]?.id ?? null);
  const [html, setHtml] = React.useState(initialHtml);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewModalHtml, setPreviewModalHtml] = React.useState<string | null>(null);
  const [previewModalError, setPreviewModalError] = React.useState<string | null>(null);
  const [previewDescription, setPreviewDescription] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<StudioTab>("ask");
  const [compactPanelOpen, setCompactPanelOpen] = React.useState(false);
  const [compactOutlineOpen, setCompactOutlineOpen] = React.useState(false);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [outlineOpen, setOutlineOpen] = React.useState(true);
  const [toolsOpen, setToolsOpen] = React.useState(true);
  const askInputRef = React.useRef<HTMLTextAreaElement>(null);
  const panelScrollRef = React.useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const utils = trpc.useUtils();
  const openPanelSection = (section: "ask" | "visuals" | "versions" | "preflight" | "code" | "footer") => {
    setActiveTab(section === "footer" ? "inspect" : section);
    setToolsOpen(true);
    setCompactPanelOpen(true);
    if (section === "versions" || section === "preflight" || section === "footer") setSelectedId(null);
    window.requestAnimationFrame(() => {
      scrollStudioPanel(panelScrollRef.current, section);
    });
  };
  const leaveStudio = () => {
    if (dirty && !window.confirm("This email has unsaved changes. Leave without saving?")) return;
    if (onBack) return onBack();
    if (window.history.length > 1) router.back();
    else router.push("/templates");
  };
  const [instruction, setInstruction] = React.useState("");
  const [askScope, setAskScope] = React.useState<AskScope>("document");
  const [visualMode, setVisualMode] = React.useState<VisualMode>("creative_concept");
  const [visualSlots, setVisualSlots] = React.useState<VisualSlotDraft[]>([
    { id: "lifestyle", label: "Picture request", prompt: "" },
  ]);
  const [visuals, setVisuals] = React.useState<GeneratedVisual[]>([]);
  const [visualFailures, setVisualFailures] = React.useState<VisualFailure[]>([]);
  const [visualProposal, setVisualProposal] = React.useState<VisualProposal | null>(null);
  const [visualTarget, setVisualTarget] = React.useState<VisualProposal["target"] | null>(null);
  const [visualGroundingProductId, setVisualGroundingProductId] = React.useState<string | null | undefined>(undefined);
  const [visualTargetDescription, setVisualTargetDescription] = React.useState<string | null>(null);
  /** The four-slot form is a deliberate advanced workflow, not the default. */
  const [advancedVisuals, setAdvancedVisuals] = React.useState(false);
  /** A short receipt after inserting a Shopify token, so it is not silent. */
  const [insertReceipt, setInsertReceipt] = React.useState<string | null>(null);
  const [promptError, setPromptError] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = React.useState<string[]>([]);
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const restoredProposalIds = React.useRef(new Set<string>());
  const [proposalView, setProposalView] = React.useState<"before" | "proposed">("proposed");
  const [versions, setVersions] = React.useState<Snapshot[]>([
    { id: "opened", label: "Opened in studio", createdAt: new Date(), blocks: cloneBlocks(studioContentBlocks(initialBlocks)), subject: initialSubject, previewText: initialPreviewText },
  ]);
  const [versionCursor, setVersionCursor] = React.useState(0);
  const [codeDraft, setCodeDraft] = React.useState("");
  const [assetUploading, setAssetUploading] = React.useState(false);
  const assetUploadInputRef = React.useRef<HTMLInputElement>(null);
  const uploadTargetIdRef = React.useRef<string | null>(null);
  const { toast } = useToast();
  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const { showProposed, notice: proposalNotice } = proposalPreviewState(
    draftSignature,
    proposal && {
      baseSignature: proposal.baseSignature,
      candidateSignature: JSON.stringify({ blocks: proposal.blocks, subject: proposal.subject, previewText: proposal.previewText }),
      stale: proposal.stale,
    },
    proposalView,
  );
  const effectiveBlocks = showProposed ? proposal!.blocks : blocks;
  const effectiveSubject = showProposed ? proposal!.subject : subject;
  const effectivePreviewText = showProposed ? proposal!.previewText : previewText;
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
      openPanelSection("ask");
      window.requestAnimationFrame(() => askInputRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  React.useEffect(() => {
    if (!compactPanelOpen && !compactOutlineOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || libraryOpen) return;
      setCompactPanelOpen(false);
      setCompactOutlineOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [compactPanelOpen, compactOutlineOpen, libraryOpen]);
  const creativeAssetsQuery = (trpc.ai as any).listBrandAssets.useQuery(
    { storeId: storeId ?? "" }, { enabled: !!storeId },
  ) as { data?: Array<{ id: string; fileName: string; type: string; url?: string }>; refetch: () => Promise<unknown> };
  const creativeAssets = creativeAssetsQuery.data ?? [];
  const libraryQuery = (trpc as any).assets.library.useQuery(
    { storeId: storeId! },
    { enabled: !!storeId && libraryOpen },
  );
  const { data: productPage } = (trpc.products as any).list.useQuery(
    { storeId: storeId ?? "", page: 1, limit: 24 },
    { enabled: !!storeId },
  ) as { data?: { products: Array<{ id: string; title: string; description?: string | null; imageUrl?: string | null; price: number; handle: string }> } };
  const nameOf = React.useCallback(
    (block: EmailBlock) => blockTitle(block, productPage?.products),
    [productPage?.products],
  );
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
  const durableVersions = durableVersionsQuery.data ?? EMPTY_DURABLE_VERSIONS;
  const savedVersionNumber = React.useMemo(() => matchingStudioVersion(durableVersions, savedDraft) ?? lastSavedVersionNumber, [durableVersions, savedDraft, lastSavedVersionNumber]);
  const draftVersionNumber = React.useMemo(() => matchingStudioVersion(durableVersions, draftContent), [durableVersions, draftContent]);
  const nextVersionNumber = durableVersionsQuery.data
    ? Math.max(lastSavedVersionNumber ?? 0, 0, ...durableVersions.map((version) => version.sequence)) + 1
    : null;
  const draftLabel = dirty
    ? `Draft · ${unsavedChangeCount} unsaved change${unsavedChangeCount === 1 ? "" : "s"}`
    : savedVersionNumber !== null ? `Draft · same as v${savedVersionNumber}` : "Draft · no saved version";
  const saveLabel = dirty
    ? draftVersionNumber !== null ? `Save matching v${draftVersionNumber}` : nextVersionNumber !== null ? `Save as v${nextVersionNumber}` : "Save version"
    : savedVersionNumber !== null ? `Saved v${savedVersionNumber}` : nextVersionNumber !== null ? `Save as v${nextVersionNumber}` : "Save version";
  const reviewNeedsSave = dirty || savedVersionNumber === null;
  const proposalHistoryQuery = (trpc.emails as any).proposalHistory.useQuery(
    { templateId: templateId ?? "" },
    { enabled: !!templateId },
  ) as { data?: ProposalHistoryItem[]; refetch: () => Promise<unknown> };
  const pendingProposalQuery = (trpc.emails as any).pendingProposal.useQuery(
    { templateId: templateId ?? "" },
    { enabled: !!templateId },
  ) as { data?: PendingProposal | null; refetch: () => Promise<unknown> };
  React.useEffect(() => {
    const pending = pendingProposalQuery.data;
    if (!pending || proposal || dirty || restoredProposalIds.current.has(pending.id)) return;
    restoredProposalIds.current.add(pending.id);
    setProposal({
      id: pending.id,
      blocks: pending.candidate.blocks,
      subject: pending.candidate.envelope.subject,
      previewText: pending.candidate.envelope.previewText,
      instruction: pending.instruction,
      createdAt: new Date(pending.createdAt),
      baseSignature: draftSignature,
      stale: pending.stale,
    });
    setProposalView("proposed");
  }, [pendingProposalQuery.data, proposal, dirty, draftSignature]);
  /**
   * Preview renders are sequenced.
   *
   * Every edit fires a debounced render, and responses came back in whatever
   * order the network delivered them — so a slower EARLIER render could land
   * after a faster later one and put the previous state back on screen. That
   * is what made a changed product look like it had not changed, and then
   * "catch up" when the next edit happened to win the race.
   *
   * Each request takes a sequence number; anything but the newest is dropped.
   */
  const renderSeq = React.useRef(0);
  const latestApplied = React.useRef(0);
  const renderMut = (trpc.emails as any).renderPreview.useMutation({
    onMutate: () => ({ seq: ++renderSeq.current }),
    onSuccess: (data: { html: string }, _vars: unknown, context: { seq: number } | undefined) => {
      const seq = context?.seq ?? renderSeq.current;
      if (seq < latestApplied.current) return;
      latestApplied.current = seq;
      setHtml(data.html);
    },
    onError: (error: { message?: string }) => setPromptError(error.message ?? "Preview could not be rendered."),
  });
  const promptMut = (trpc.emails as any).promptEdit.useMutation();
  const resolveProposalMut = (trpc.emails as any).resolveProposal.useMutation();
  const restoreVersionMut = (trpc.templates as any).restoreVersion.useMutation();
  const createAssetUploadMut = (trpc.emails as any).createAssetUpload.useMutation();
  const completeAssetUploadMut = (trpc.emails as any).completeAssetUpload.useMutation();
  const saveMut = (trpc.templates as any).update.useMutation() as { mutate: (input: unknown, opts?: { onSuccess?: (data: any) => void; onError?: (error: { message?: string }) => void }) => void; isPending: boolean };
  const renderRef = React.useRef(renderMut); renderRef.current = renderMut;
  const firstRun = React.useRef(Boolean(initialHtml));
  React.useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const timer = window.setTimeout(() => renderRef.current.mutate({ blocks: effectiveBlocks, subject: effectiveSubject, previewText: effectivePreviewText, variables: previewVariables, brandKit, storeId }), 220);
    return () => window.clearTimeout(timer);
  }, [effectiveBlocks, effectiveSubject, effectivePreviewText, previewVariables, brandKit, storeId]);

  const generateVisualsMut = (trpc.emails as any).generateVisuals.useMutation();
  const { data: visualCapabilities } = (trpc.emails as any).visualCapabilities.useQuery(
    { templateId }, { enabled: !!templateId },
  ) as { data?: import("./VisualGenerator").VisualCapabilities };

  /** The product the selected block is about, if any — visuals are grounded in it. */
  const blockProductId = visualGroundingProductId !== undefined ? visualGroundingProductId : productReferenceId(selected);
  const { data: referenceProduct } = (trpc.products as any).getById.useQuery(
    { id: blockProductId ?? "" }, { enabled: !!blockProductId },
  ) as { data?: { id: string; title: string; imageUrl?: string | null; storeId: string } };
  const blockProduct = blockProductId
    ? (referenceProduct?.storeId === storeId ? referenceProduct : (productPage?.products ?? []).find((product) => product.id === blockProductId)) ?? null
    : null;

  const generateVisuals = (requestedSlots = visualSlots, requestedMode = visualMode, productId = blockProductId) => {
    if (!storeId) { toast("Choose a store before generating a visual.", "error"); return; }
    if (generateVisualsMut.isPending) return;
    const slots = requestedSlots
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
    if (!visualTarget && (selected?.type === "image" || selected?.type === "hero")) {
      setVisualTarget({ kind: "existing", blockType: selected.type, blockId: selected.id });
      setVisualTargetDescription("Fill this image block");
    }
    setVisualFailures([]);
    generateVisualsMut.mutate(
      { storeId, templateId, productId: productId ?? undefined, sourceAssetIds: productId ? [] : selectedAssetIds.slice(0, 1), mode: productId || selectedAssetIds.length ? "product_safe" : requestedMode, slots },
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

  const generateProposedVisual = () => {
    if (!visualProposal) return;
    if (!storeId) { toast("Choose a store before generating a visual.", "error"); return; }
    if (generateVisualsMut.isPending) return;
    const slot = {
      id: visualProposal.target.blockType === "hero" ? "hero" : "lifestyle",
      label: "Requested visual",
      prompt: visualProposal.instruction,
    };
    setVisualSlots([slot]);
    setVisualMode(visualProposal.mode);
    setVisualTarget(visualProposal.target);
    setVisualGroundingProductId(visualProposal.product?.id ?? null);
    setVisualTargetDescription(visualProposal.targetDescription);
    setVisuals([]);
    setVisualFailures([]);
    setAdvancedVisuals(true);
    openPanelSection("visuals");
    generateVisuals([slot], visualProposal.mode, visualProposal.product?.id ?? null);
    setVisualProposal(null);
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
    if (visualTarget) {
      const placement = placeProposalVisual(blocks, visualTarget, visual, () => newId(visualTarget.blockType));
      if ("error" in placement) { toast(placement.error, "error"); return; }
      setBlocks(placement.blocks);
      setSelectedId(placement.selectedId);
      setVisualTarget(null);
      setVisualTargetDescription(null);
      setVisuals([]);
      setVisualGroundingProductId(undefined);
      setActiveTab("inspect");
      toast("Visual placed in the email. Save the version to keep it.", "success");
      return;
    }
    if (!selected) { toast("Select an image or hero block first.", "error"); return; }
    if (selected.type === "image") {
      updateBlock({ ...selected, props: { ...selected.props, src: visual.url, alt: visual.label,
        ...(visual.sourceProductId !== undefined ? { sourceProductId: visual.sourceProductId ?? undefined } : {}) } } as EmailBlock);
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
    setVisualGroundingProductId(undefined);
    toast("Visual placed. Nothing is sent until you approve the campaign.", "success");
  };

  /**
   * Place a picture the merchant chose from the library.
   *
   * A product block is refused on purpose: its image is the product's own
   * Shopify photograph. Letting a chosen picture sit there would make the
   * block stop being a record of the product.
   */
  const useLibraryItem = (item: { url: string; label: string; altText?: string | null }) => {
    if (!selected) { toast("Select an image or hero block first.", "error"); return; }
    if (selected.type === "image") {
      const props = { ...selected.props, src: item.url, alt: item.altText || item.label };
      delete props.sourceProductId;
      updateBlock({ ...selected, props });
    } else if (selected.type === "hero") {
      updateBlock({ ...selected, props: { ...selected.props, bgImageSrc: item.url } } as EmailBlock);
    } else if (selected.type === "product") {
      toast("A product block always shows the product's own Shopify image. Put this in an image or hero block instead.", "error");
      return;
    } else {
      toast("That block cannot hold an image. Select an image or hero block.", "error");
      return;
    }
    setLibraryOpen(false);
    toast("Image placed. Nothing is sent until you approve the campaign.", "success");
  };

  /**
   * Bind a product the merchant PICKED. Only the reference is stored — title,
   * price, description and image are resolved from the store at render and
   * send time, so the email cannot drift from what the store actually says.
   */
  const bindProduct = (productId: string) => {
    if (!selected || selected.type !== "product") return;
    // Carries no trace of the product being replaced — see `product-binding`.
    updateBlock(bindProductToBlock(selected, productId));
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

  /**
   * Create a campaign visual FROM a product, as a new block below it.
   *
   * Never into the product block: its picture is resolved from Shopify at send
   * time, so anything placed there shows in preview and is replaced on the way
   * out.
   */
  const createProductScene = () => {
    if (!selected) return;
    const imageBlock = createDefaultBlock("image", newId("image"));
    if (imageBlock.type === "image" && selected.type === "product" && selected.props.productId) {
      imageBlock.props.sourceProductId = selected.props.productId;
    }
    const index = blocks.findIndex((block) => block.id === selected.id);
    const next = [...blocks];
    next.splice(Math.max(0, index + 1), 0, imageBlock);
    setBlocks(next);
    setSelectedId(imageBlock.id);
    setVisualGroundingProductId(selected.type === "product" ? selected.props.productId || null : null);
    setVisualMode("product_safe");
    setVisualTarget(null);
    setVisualTargetDescription(null);
    setSelectedAssetIds([]);
    setVisualSlots([{ id: "lifestyle", label: "Picture request", prompt: "" }]);
    setVisuals([]);
    setVisualFailures([]);
    setAdvancedVisuals(true);
    openPanelSection("visuals");
    toast("Added an image block below the product. Its own photo is untouched.", "success");
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
    // Inserting into a field the merchant cannot see happened silently. Go
    // back to Edit, and say where it landed.
    const fieldLabel = field === "html" ? "body text" : field === "heading" ? "heading" : field;
    setActiveTab("inspect");
    setInsertReceipt(`Inserted in ${nameOf(selected)} ${fieldLabel}`);
    window.setTimeout(() => setInsertReceipt(null), 4000);
  };

  const updateBlock = (next: EmailBlock) => {
    const parsed = emailBlockSchema.safeParse(next);
    if (!parsed.success) { toast(parsed.error.issues[0]?.message ?? "That block is not valid.", "error"); return; }
    setBlocks((current) => current.map((block) => block.id === next.id ? parsed.data as EmailBlock : block));
  };
  const move = (blockId: string, direction: -1 | 1) => {
    setBlocks((current) => { const index = current.findIndex((block) => block.id === blockId); const destination = index + direction; if (index < 0 || destination < 0 || destination >= current.length) return current; const next = [...current]; [next[index], next[destination]] = [next[destination]!, next[index]!]; return next; });
  };
  const remove = (blockId: string) => {
    setBlocks((current) => { const next = current.filter((block) => block.id !== blockId); if (selectedId === blockId) setSelectedId(next[0]?.id ?? null); return next; });
  };
  const selectCanvasBlock = (blockId: string) => {
    if (blockId === "__brand_footer") { openPanelSection("footer"); return; }
    // The inspector edits the current draft, never the proposed snapshot. A
    // click on the preview therefore returns to the editable draft first.
    if (showProposed) setProposalView("before");
    if (!blocks.some((block) => block.id === blockId)) {
      toast("This block belongs to Joon's suggestion. Accept it before editing it.", "info");
      return;
    }
    setSelectedId(blockId);
    setVisualGroundingProductId(undefined);
    setAdvancedVisuals(false);
    setActiveTab("inspect");
    setToolsOpen(true);
    setCompactPanelOpen(true);
    setCompactOutlineOpen(false);
  };
  const add = (type: EmailBlockType) => {
    const block = createDefaultBlock(type, newId(type)); setBlocks((current) => [...current, block]); setSelectedId(block.id); setVisualGroundingProductId(undefined); setActiveTab(type === "custom_html" ? "code" : "inspect"); setShowAdd(false); setCompactOutlineOpen(false); setCompactPanelOpen(true);
  };
  const createCheckpoint = (label: string, next?: { blocks: EmailBlock[]; subject: string; previewText: string }) => {
    const snapshot: Snapshot = { id: `v-${Date.now()}`, label, createdAt: new Date(), blocks: cloneBlocks(next?.blocks ?? blocks), subject: next?.subject ?? subject, previewText: next?.previewText ?? previewText };
    setVersions((current) => [...current.slice(0, versionCursor + 1), snapshot]); setVersionCursor((current) => current + 1);
  };
  const restoreVersion = (index: number) => {
    const version = versions[index]; if (!version) return;
    setBlocks(cloneBlocks(studioContentBlocks(version.blocks))); setSubject(version.subject); setPreviewText(version.previewText); setSelectedId(studioContentBlocks(version.blocks)[0]?.id ?? null); setVersionCursor(index); setProposal(null);
  };
  const saveDraft = (afterSave?: () => void) => {
    if (!templateId) { toast("This email cannot be saved right now. Reopen it and try again.", "error"); return; }
    if (!dirty && savedVersionNumber !== null) {
      toast(`Matches v${savedVersionNumber}. Nothing new to save.`, "info");
      afterSave?.();
      return;
    }
    const validated = emailBlocksSchema.safeParse(blocks);
    if (!validated.success) { toast(validated.error.issues[0]?.message ?? "This email contains an invalid block.", "error"); return; }
    const submittedSignature = draftSignature;
    const savedDocument = { blocks: validated.data, subject, previewText };
    saveMut.mutate({ id: templateId, subject, previewText, blocks: validated.data }, {
      onSuccess: (saved) => {
        createCheckpoint("Saved version", savedDocument);
        setSavedDraft({ ...savedDocument, blocks: cloneBlocks(savedDocument.blocks) });
        if (proposal && submittedSignature !== proposal.baseSignature) {
          setProposal(null);
          void proposalHistoryQuery.refetch();
          void pendingProposalQuery.refetch();
        }
        if (typeof saved?.version?.sequence === "number") setLastSavedVersionNumber(saved.version.sequence);
        (utils.templates.getById as any).setData({ id: templateId }, (current: any) => current ? { ...current, ...saved } : current);
        void utils.templates.getById.invalidate({ id: templateId });
        void utils.templates.list.invalidate();
        void utils.campaigns.getById.invalidate();
        void durableVersionsQuery.refetch();
        const versionNumber = saved?.version?.sequence;
        toast(versionNumber
          ? afterSave ? `Saved v${versionNumber}. This campaign now reviews v${versionNumber}.` : `Saved v${versionNumber}.`
          : "Email saved.", "success");
        afterSave?.();
      },
      onError: (error) => toast(error.message ?? "Could not save this email.", "error"),
    });
  };
  const inboxRenderMut = (trpc.emails as any).renderPreview.useMutation();
  const inboxRenderSeq = React.useRef(0);
  const openFullPreview = (version?: DurableVersion) => {
    const historical = version ? (version.document as { blocks: EmailBlock[]; envelope: { subject: string; previewText: string } }) : null;
    const description = version ? `Saved v${version.sequence} · read-only layout and copy with current store data · not a sent snapshot`
      : showProposed ? "Joon's suggestion · not applied to your draft"
      : dirty ? `Your draft · ${unsavedChangeCount} unsaved changes`
      : savedVersionNumber !== null ? `v${savedVersionNumber} · the version this campaign reviews` : "Your draft · no saved version";
    setPreviewDescription(description);
    setPreviewOpen(true);
    setPreviewModalHtml(null);
    setPreviewModalError(null);
    const sequence = ++inboxRenderSeq.current;
    inboxRenderMut.mutate({ blocks: historical?.blocks ?? effectiveBlocks, subject: historical?.envelope.subject ?? effectiveSubject, previewText: historical?.envelope.previewText ?? effectivePreviewText, variables: previewVariables, brandKit, storeId }, {
      onSuccess: (data: { html: string }) => { if (sequence === inboxRenderSeq.current) setPreviewModalHtml(data.html); },
      onError: () => { if (sequence === inboxRenderSeq.current) setPreviewModalError("Joon couldn't render this preview. Your edits are still here; close this view and try again."); },
    });
  };
  const askJoon = (text = instruction, scope?: "subject" | "copy" | "visual" | "tone") => {
    if (!text.trim() || promptMut.isPending) return; setPromptError(null);
    const editScope = askScope === "block" && selectedId
      ? { kind: "block" as const, blockId: selectedId }
      : askScope === "envelope"
      ? { kind: "envelope" as const }
      : { kind: "document" as const };
    promptMut.mutate({ instruction: text, blocks, subject, previewText, scope, editScope, storeId, templateId, selectedBlockId: selectedId ?? undefined }, {
      onSuccess: (data: { applied: boolean; blocks: EmailBlock[]; subject?: string; previewText?: string; proposalId?: string; error?: string; visualProposal?: VisualProposal }) => {
        // A request for artwork comes back as a proposal, not a mutation.
        if (data.visualProposal) { setVisualProposal(data.visualProposal); setInstruction(""); return; }
        if (!data.applied) { setPromptError(data.error ?? "Joon could not produce a safe change."); return; }
        if (data.proposalId) restoredProposalIds.current.add(data.proposalId);
        setProposal({ id: data.proposalId, blocks: data.blocks, subject: data.subject ?? subject, previewText: data.previewText ?? previewText, instruction: text, createdAt: new Date(), baseSignature: draftSignature }); setProposalView("proposed"); setInstruction(""); void proposalHistoryQuery.refetch();
      },
      onError: (error: { message?: string }) => setPromptError(error.message ?? "Joon is unavailable right now."),
    });
  };
  const acceptProposal = () => {
    if (!proposal || resolveProposalMut.isPending) return;
    if (proposal.stale) { toast("This proposal is based on an older saved email. Reject it and ask Joon again.", "error"); return; }
    if (draftSignature !== proposal.baseSignature) { toast("The email changed after this proposal. Save or discard those edits, then ask Joon again.", "error"); return; }
    if (JSON.stringify({ blocks: proposal.blocks, subject: proposal.subject, previewText: proposal.previewText }) === proposal.baseSignature) { toast("Joon did not change the email. Reject this proposal and try another instruction.", "error"); return; }
    const apply = () => { createCheckpoint(`Joon · ${proposal.instruction}`, proposal); setBlocks(cloneBlocks(proposal.blocks)); setSubject(proposal.subject); setPreviewText(proposal.previewText); setSelectedId(proposal.blocks.some((block) => block.id === selectedId) ? selectedId : proposal.blocks[0]?.id ?? null); setProposal(null); if (proposal.id) { setSavedDraft({ blocks: cloneBlocks(proposal.blocks), subject: proposal.subject, previewText: proposal.previewText }); void durableVersionsQuery.refetch(); void proposalHistoryQuery.refetch(); } };
    if (!proposal.id) { apply(); return; }
    resolveProposalMut.mutate({ proposalId: proposal.id, decision: "accepted" }, { onSuccess: (data: { version?: { sequence?: number } | null }) => { apply(); if (typeof data.version?.sequence === "number") setLastSavedVersionNumber(data.version.sequence); void pendingProposalQuery.refetch(); }, onError: (error: { message?: string }) => toast(error.message ?? "Could not accept this proposal.", "error") });
  };
  const rejectProposal = () => {
    if (!proposal || resolveProposalMut.isPending) return;
    if (!proposal.id) { setProposal(null); return; }
    resolveProposalMut.mutate({ proposalId: proposal.id, decision: "rejected" }, { onSuccess: () => { setProposal(null); void proposalHistoryQuery.refetch(); void pendingProposalQuery.refetch(); }, onError: (error: { message?: string }) => toast(error.message ?? "Could not reject this proposal.", "error") });
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
        const nextBlocks = studioContentBlocks(data.template.blocks as EmailBlock[]);
        setBlocks(cloneBlocks(nextBlocks)); setSubject(data.template.subject); setPreviewText(data.template.previewText ?? ""); setSelectedId(nextBlocks[0]?.id ?? null); setProposal(null); setSavedDraft({ blocks: cloneBlocks(nextBlocks), subject: data.template.subject, previewText: data.template.previewText ?? "" }); if (typeof data.version?.sequence === "number") setLastSavedVersionNumber(data.version.sequence); void durableVersionsQuery.refetch(); toast(`Restored v${data.version?.sequence ?? ""}. Saved history and the approved email are unchanged.`, "success");
      },
      onError: (error: { message?: string }) => toast(error.message ?? "Could not restore this version.", "error"),
    });
  };
  const openUploadPicker = (targetBlockId: string | null = selectedId) => {
    uploadTargetIdRef.current = targetBlockId;
    assetUploadInputRef.current?.click();
  };
  const uploadAsset = async (file: File, targetBlockId?: string | null) => {
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
      setSelectedAssetIds([asset.id]);
      await creativeAssetsQuery.refetch();
      void libraryQuery.refetch();
      const target = blocks.find((block) => block.id === targetBlockId);
      if (target?.type === "image" || target?.type === "hero") {
        setBlocks((current) => current.map((block) => placeUploadedImage(block, targetBlockId!, asset.url, file.name)));
        setLibraryOpen(false);
        toast("Image uploaded and placed in this email. Save the version to keep it.", "success");
      } else {
        toast("Image added to this store’s asset library.", "success");
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not upload this image.", "error");
    } finally {
      setAssetUploading(false);
    }
  };

  const askPanel = <AskPanel embedded visualProposal={visualProposal} onVisualGenerate={generateProposedVisual} onVisualRefine={() => { setInstruction(visualProposal?.instruction ?? ""); setVisualProposal(null); }} onVisualCancel={() => setVisualProposal(null)} inputRef={askInputRef} selected={selected} scope={askScope} setScope={setAskScope} instruction={instruction} setInstruction={setInstruction} pending={promptMut.isPending} error={promptError} onAsk={askJoon} history={proposalHistoryQuery.data ?? []} />;
  const beginPictureGeneration = (several = false) => {
    setVisualTarget(null); setVisualTargetDescription(null);
    const currentUrl = selected?.type === "image" ? selected.props.src : selected?.type === "hero" ? selected.props.bgImageSrc : null;
    const existingReference = currentUrl ? creativeAssets.find((asset) => asset.url === currentUrl) : null;
    if (!blockProductId && existingReference) setSelectedAssetIds([existingReference.id]);
    setVisualMode(blockProductId || existingReference || selectedAssetIds.length ? "product_safe" : "creative_concept");
    setVisualSlots(several ? [
      { id: "hero", label: "Hero picture", prompt: "" }, { id: "lifestyle", label: "In use", prompt: "" },
      { id: "crop", label: "Close crop", prompt: "" }, { id: "backdrop", label: "Backdrop", prompt: "" },
    ] : [{ id: "lifestyle", label: "Picture request", prompt: "" }]);
    setAdvancedVisuals(true); openPanelSection("visuals");
  };
  const pictureControls = !selected && !advancedVisuals ? (
    <button type="button" onClick={() => add("image")} className="w-full rounded-lg border border-border px-3 py-2 text-left text-[13px] hover:bg-[#F4F2EC]">Add an image block</button>
  ) : !advancedVisuals ? (
    <VisualActions
      selected={selected}
      capabilities={visualCapabilities ?? null}
      productTitle={blockProduct?.title ?? null}
      embedded
      onGenerate={() => beginPictureGeneration()}
      onUpload={() => openUploadPicker()}
      onChooseFromLibrary={() => setLibraryOpen(true)}
      onCreateProductScene={createProductScene}
      onOpenAdvanced={() => beginPictureGeneration(true)}
    />
  ) : <>
    {!visualTarget ? <label className="block text-[12px]">Shopify product reference
      <select value={blockProductId ?? ""} disabled={generateVisualsMut.isPending} onChange={(event) => {
        const id = event.target.value || null; setVisualGroundingProductId(id); setSelectedAssetIds([]);
        setVisualMode(id ? "product_safe" : "creative_concept");
        if (selected?.type === "image") { const props = { ...selected.props }; if (id) props.sourceProductId = id; else delete props.sourceProductId; updateBlock({ ...selected, props }); }
      }} className="mt-1 w-full rounded-lg border border-border bg-transparent px-2 py-2 text-[13px]">
        <option value="">No Shopify product · use a reference or illustrative artwork</option>
        {blockProduct && !(productPage?.products ?? []).some((product) => product.id === blockProduct.id) ? <option value={blockProduct.id}>{blockProduct.title}</option> : null}
        {(productPage?.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
      </select>
    </label> : null}
    <VisualGenerator mode={blockProductId || selectedAssetIds.length ? "product_safe" : visualMode} setMode={(mode) => { setVisualMode(mode); if (mode === "creative_concept") setSelectedAssetIds([]); }} slots={visualSlots} setSlots={setVisualSlots} productTitle={blockProduct?.title ?? null} productImageUrl={blockProduct?.imageUrl} productHasImage={Boolean(blockProduct?.imageUrl)} referenceAssets={creativeAssets} selectedReferenceId={selectedAssetIds[0] ?? null} onSelectReference={(id) => { setSelectedAssetIds(id ? [id] : []); setVisualMode(id ? "product_safe" : "creative_concept"); }} capabilities={visualCapabilities ?? null} results={visuals} failures={visualFailures} pending={generateVisualsMut.isPending} placementDescription={visualTargetDescription} onGenerate={() => generateVisuals()} onUseAsset={useVisual} onClose={() => setAdvancedVisuals(false)} />
    {!blockProductId ? <button type="button" onClick={() => openUploadPicker(null)} className="mt-2 text-[12px] text-[#2D4F9E] underline underline-offset-2">Upload a reference photo</button> : null}
  </>;

  // The root fills its parent rather than subtracting a fixed 6.25rem for a
  // dashboard top bar the Studio route no longer has — that allowance was
  // leaving ~100px of dead space under the editor. The card border and shadow
  // went with it: this is a workspace, not a card on a page.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FFFDF8] text-foreground">
      <input
        ref={assetUploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        aria-label="Upload an email image"
        disabled={assetUploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          const targetBlockId = uploadTargetIdRef.current;
          event.currentTarget.value = "";
          uploadTargetIdRef.current = null;
          if (file) void uploadAsset(file, targetBlockId);
        }}
      />
      <StudioTopBar
        name={templateName ?? "Untitled email"}
        state={dirty ? "draft" : "saved"}
        stateLabel={draftLabel}
        onOpenVersions={() => openPanelSection("versions")}
        backLabel={backLabel ?? "Back"}
        canUndo={versionCursor > 0}
        canRedo={versionCursor < versions.length - 1}
        onUndo={() => restoreVersion(Math.max(0, versionCursor - 1))}
        onRedo={() => restoreVersion(Math.min(versions.length - 1, versionCursor + 1))}
        onPreview={() => openFullPreview()}
        onSave={() => {
          if (showProposed) {
            toast("Accept Joon's suggestion, or switch to Current draft before saving.", "info");
            return;
          }
          saveDraft();
        }}
        saving={saveMut.isPending}
        saveLabel={saveLabel}
        saveDisabled={showProposed || (!dirty && savedVersionNumber !== null)}
        reviewHref={reviewHref ?? null}
        reviewBlocked={saveMut.isPending || showProposed}
        onReview={reviewNeedsSave && reviewHref ? () => saveDraft(() => router.push(reviewHref)) : undefined}
        onAddBlock={() => setShowAdd((value) => !value)}
        onOpenTools={() => setCompactPanelOpen(true)}
        onBack={leaveStudio}
      />
      {proposal ? <ProposalBar proposal={proposal} view={showProposed ? "proposed" : "before"} setView={setProposalView} reject={rejectProposal} accept={acceptProposal} pending={resolveProposalMut.isPending} notice={proposalNotice} /> : null}
      {showAdd ? <div className="absolute right-3 top-[68px] z-50 w-56 overflow-hidden rounded-xl border border-border bg-[var(--surface,#FFFDF8)] shadow-xl xl:hidden"><BlockPicker onAdd={add} /></div> : null}

      {/*
        The library declares aria-modal, so the Studio behind it has to be
        genuinely inert. The backdrop stops a pointer; only this stops Tab
        reaching the tab strip and editor underneath.
      */}
      <div className="relative flex min-h-0 flex-1" inert={libraryOpen}>
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
          <button type="button" onClick={() => setOutlineOpen(false)} aria-expanded={true} className="mx-3 mt-2 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-[#FFFDF8] px-3 py-2 text-[12px] font-medium outline-none transition-colors hover:border-[#2D4F9E] hover:bg-[#E9EFFF] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"><PanelLeftClose className="h-3.5 w-3.5" />Hide outline</button>
          {showAdd ? <BlockPicker onAdd={add} /> : null}
          <div className="min-h-0 flex-1 overflow-y-auto"><BlockList blocks={blocks} selectedId={selectedId} onSelect={(blockId) => { selectCanvasBlock(blockId); setToolsOpen(true); }} onMove={move} onRemove={remove} blockTitle={nameOf} /><button type="button" onClick={() => openPanelSection("footer")} className="mx-3 mb-3 block text-left text-[12px] text-[#2D4F9E] underline underline-offset-2">Brand footer · fixed after all content</button></div>
        </aside>

        {isDesktop && !outlineOpen ? (
          <button
            type="button"
            onClick={() => setOutlineOpen(true)}
            aria-expanded={false}
            className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-border bg-[#FFFDF8] px-3 py-2 text-[12px] font-medium shadow-sm outline-none transition-colors hover:border-[#2D4F9E] hover:bg-[#E9EFFF] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Show outline
          </button>
        ) : null}
        {isDesktop && !toolsOpen ? (
          <button
            type="button"
            onClick={() => setToolsOpen(true)}
            aria-expanded={false}
            className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-border bg-[#FFFDF8] px-3 py-2 text-[12px] font-medium shadow-sm outline-none transition-colors hover:border-[#2D4F9E] hover:bg-[#E9EFFF] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Show tools
          </button>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#F4F2EC] p-2">
          <div className="flex shrink-0 items-center justify-between px-1 pb-2 text-[12px]">
            <span className="font-medium">{showProposed ? "Joon's suggestion" : "Draft canvas"}</span>
            <span className="text-muted-foreground">{showProposed ? "Not applied to your draft" : "Always your current draft"}</span>
          </div>
          <div className="mb-2 grid shrink-0 gap-2 rounded-lg border border-border bg-[#FFFDF8] p-2 md:grid-cols-2">
            <EnvelopeField label="Subject" value={effectiveSubject} readOnly={Boolean(proposal && !proposalNotice)} onChange={setSubject} />
            <EnvelopeField label="Inbox preview" value={effectivePreviewText} readOnly={Boolean(proposal && !proposalNotice)} placeholder="The line people see beside the subject" onChange={setPreviewText} />
          </div>
          <div className="min-h-0 flex-1"><EmailPreviewFrame html={html} isLoading={renderMut.isPending} selectedBlockId={selectedId} onSelectBlock={selectCanvasBlock} mode="editor" /></div>
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
                ? "fixed inset-x-0 bottom-0 z-40 flex h-[72dvh] overflow-hidden rounded-t-xl border shadow-2xl"
                : "hidden",
          )}
          style={isDesktop ? { width: toolsOpen ? 360 : 0 } : undefined}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <PanelHeading eyebrow={selected ? "Selected block" : "Whole email"} title={selected ? `${selected.type.replace(/_/g, " ")} block` : "Whole email"} description={selected ? nameOf(selected) : "Subject, Joon, checks and versions together."} />
            <button type="button" onClick={() => isDesktop ? setToolsOpen(false) : setCompactPanelOpen(false)} className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-[#F4F2EC]" aria-label="Close email panel"><X className="h-4 w-4" /></button>
          </div>
          <div ref={panelScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {selected ? <>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <button type="button" onClick={() => { setSelectedId(null); setCompactPanelOpen(true); }} className="text-[12px] text-[#2D4F9E] underline underline-offset-2">Whole email</button>
                <span className="text-border">·</span>
                <button type="button" onClick={() => move(selected.id, -1)} disabled={blocks[0]?.id === selected.id} className="text-[12px] disabled:opacity-40">Move up</button>
                <button type="button" onClick={() => move(selected.id, 1)} disabled={blocks[blocks.length - 1]?.id === selected.id} className="text-[12px] disabled:opacity-40">Move down</button>
                <button type="button" onClick={() => remove(selected.id)} className="ml-auto text-[12px] text-[var(--risk,#B95849)]">Delete</button>
              </div>
              {selected.type === "image" || selected.type === "hero" ? <ContextSection title="Picture" description="Choose, upload or generate a picture for this block." sectionKey="visuals">{pictureControls}</ContextSection> : null}
              <ContextSection title="Content" description="What this block says and where it leads.">
                <BlockEditor block={selected} onUpdate={updateBlock} embedded onOpenVisuals={() => { setAdvancedVisuals(false); openPanelSection("visuals"); }} onUploadImage={() => openUploadPicker()} onChooseAsset={() => setLibraryOpen(true)} />
              </ContextSection>
              {selected.type === "product" || selected.type === "product_grid" ? <ContextSection title="From Shopify" description="Store facts stay connected to your catalog."><ShopifyDataPanel selected={selected} products={(productPage?.products ?? []) as any} collections={(storeCollections ?? []) as any} variants={(productVariants ?? []) as any} storeConnected={!!storeId} onBindProduct={bindProduct} onBindVariant={bindVariant} onToggleGridProduct={toggleGridProduct} onBindCollection={bindCollection} onInsertToken={insertToken} /></ContextSection> : null}
              {selected.type === "product" || (advancedVisuals && selected.type !== "image" && selected.type !== "hero") ? <ContextSection title="Picture" description={selected.type === "product" ? "The product photo stays from Shopify. Make a separate campaign picture." : "Choose, upload or generate a picture for this email."} sectionKey="visuals">{pictureControls}</ContextSection> : null}
              {hasCopyAssistance(selected) ? <ContextSection title="Ask Joon about this block" description="Copy and supported styling suggestions only. Picture generation and its references are in Picture above." sectionKey="ask">{askPanel}</ContextSection> : null}
              <details className="border-t border-border px-4 py-3" open={activeTab === "code" ? true : undefined}><summary className="cursor-pointer text-[13px] font-medium">Advanced · structured code</summary><CodePanel selected={selected} code={codeDraft} setCode={setCodeDraft} apply={applyCode} /></details>
            </> : <>
              <ContextSection title="Envelope" description="The subject and the line shown beside it in an inbox."><div className="grid gap-3"><EnvelopeField label="Subject" value={subject} onChange={setSubject} /><EnvelopeField label="Inbox preview" value={previewText} onChange={setPreviewText} /></div></ContextSection>
              <ContextSection title="Ask Joon about this email" description="Ask for the subject or the whole draft." sectionKey="ask">{askPanel}</ContextSection>
              <ContextSection title="Pictures" description="Make campaign artwork, then choose where it belongs." sectionKey="visuals">{pictureControls}</ContextSection>
              <ContextSection title="Checks on this draft" description={`${preflight.passed} of ${preflight.checks.length} checks pass.`} sectionKey="preflight"><PreflightPanel preflight={preflight} /></ContextSection>
              <ContextSection title="Brand footer" description="Fixed after all email content. It cannot be moved or deleted here." sectionKey="footer"><p className="text-[12px] leading-5 text-muted-foreground">The renderer always supplies the unsubscribe link. Brand footer text, address and social links come from your store’s Brand settings.</p><a href="/intelligence/brand" className="mt-2 inline-block text-[13px] text-[#2D4F9E] underline underline-offset-2" onClick={(event) => { if (dirty && !window.confirm("This email has unsaved changes. Leave without saving?")) event.preventDefault(); }}>Edit brand footer and social links</a></ContextSection>
              <ContextSection title="Versions" description="View a saved email without changing your draft, or restore it." sectionKey="versions"><VersionsPanel versions={versions} cursor={versionCursor} restore={restoreVersion} durableVersions={durableVersionsQuery.data ?? []} restoreDurable={restoreDurableVersion} viewDurable={(version) => openFullPreview(version)} restoring={restoreVersionMut.isPending} /></ContextSection>
            </>}
            {insertReceipt ? <p role="status" className="mx-4 my-3 rounded-lg border border-[#157858]/30 bg-[#E5F4EE] px-2.5 py-1.5 text-[12px] text-[#157858]">{insertReceipt}</p> : null}
          </div>
        </aside>
        {compactOutlineOpen ? <div className="fixed inset-0 z-40 xl:hidden">
          <button type="button" aria-label="Close block list" onClick={() => setCompactOutlineOpen(false)} className="absolute inset-0 bg-black/20" />
          <div role="dialog" aria-modal="true" aria-label="Blocks in this email" className="absolute inset-x-0 bottom-0 flex max-h-[72dvh] flex-col overflow-hidden rounded-t-xl border border-border bg-[#FFFDF8] shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-[15px] font-medium">Blocks</h2><button type="button" onClick={() => setCompactOutlineOpen(false)} aria-label="Close block list" className="rounded-lg border border-border p-1.5"><X className="h-4 w-4" /></button></div>
            <div className="overflow-y-auto"><BlockList blocks={blocks} selectedId={selectedId} onSelect={selectCanvasBlock} onMove={move} onRemove={remove} blockTitle={nameOf} /></div>
            <button type="button" onClick={() => { setCompactOutlineOpen(false); setShowAdd(true); }} className="m-3 rounded-lg border border-border px-3 py-2 text-[13px]">Add block</button>
          </div>
        </div> : null}
      </div>

      <nav aria-label="Studio actions" className="grid shrink-0 grid-cols-4 border-t border-border bg-[#FFFDF8] xl:hidden">
        <button type="button" onClick={() => { setCompactPanelOpen(false); setCompactOutlineOpen(true); }} className="px-2 py-3 text-[12px]">Blocks</button>
        <button type="button" onClick={() => { setSelectedId(null); setCompactOutlineOpen(false); setCompactPanelOpen(true); }} className="px-2 py-3 text-[12px]">Email</button>
        <button type="button" onClick={() => openFullPreview()} className="px-2 py-3 text-[12px]">Preview</button>
        <button type="button" disabled={!reviewHref || saveMut.isPending || showProposed} onClick={() => { if (reviewNeedsSave) saveDraft(() => router.push(reviewHref!)); else router.push(reviewHref!); }} className="px-2 py-3 text-[12px] disabled:opacity-40">Delivery</button>
      </nav>

      {libraryOpen ? (
        <AssetLibraryDialog
          library={libraryQuery.data ?? null}
          loading={libraryQuery.isLoading}
          initialTab={selected?.type === "product" ? "shopify" : undefined}
          onClose={() => setLibraryOpen(false)}
          onSelect={useLibraryItem}
          onUpload={() => openUploadPicker()}
          onGenerate={() => { setLibraryOpen(false); setAdvancedVisuals(false); openPanelSection("visuals"); }}
        />
      ) : null}
      <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#171717]/70" />
          <Dialog.Content className="fixed inset-x-3 bottom-3 top-3 z-50 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-xl bg-[#FFFDF8] shadow-2xl outline-none sm:inset-y-[4vh]" aria-describedby="studio-preview-description">
            <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-[15px] font-medium">Inbox preview</Dialog.Title>
                <Dialog.Description id="studio-preview-description" className="mt-1 text-[12px] text-muted-foreground">
                  {previewDescription}
                </Dialog.Description>
              </div>
              <Dialog.Close className="rounded-lg border border-border p-2 outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]" aria-label="Close full preview"><X className="h-4 w-4" /></Dialog.Close>
            </div>
            <div className="min-h-0 flex-1 p-3 sm:p-4">
              {previewModalHtml ? <EmailPreviewFrame html={previewModalHtml} /> : (
                <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground" role="status">
                  {previewModalError ?? "Rendering the full email…"}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );

}

/**
 * The library opens over the Studio rather than replacing a panel, because
 * choosing a picture is an errand inside editing a block — the email stays
 * visible behind it and the selection is not lost.
 */
function AssetLibraryDialog({
  library, loading, initialTab, onClose, onSelect, onUpload, onGenerate,
}: {
  library: Library | null;
  loading: boolean;
  initialTab?: "shopify" | "uploads" | "generated" | "brand";
  onClose: () => void;
  onSelect: (item: LibraryItem) => void;
  onUpload: () => void;
  onGenerate: () => void;
}) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-6">
      <button type="button" aria-label="Close asset library" onClick={onClose} className="absolute inset-0 cursor-default" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Asset library"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-[var(--surface,#FFFDF8)] shadow-xl sm:rounded-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-[#F4F2EC] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AssetLibrary
            library={library}
            loading={loading}
            initialTab={initialTab}
            onSelect={onSelect}
            onUpload={onUpload}
            onGenerate={onGenerate}
          />
        </div>
      </div>
    </div>
  );
}

function ProposalBar({ proposal, view, setView, reject, accept, pending, notice }: { proposal: Proposal; view: "before" | "proposed"; setView: (view: "before" | "proposed") => void; reject: () => void; accept: () => void; pending: boolean; notice: string | null }) {
  return <div className="shrink-0 border-b border-[var(--attention,#C99116)]/30 bg-[var(--attention-soft,#FFF0B8)] px-5 py-2.5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-3"><Sparkles className="h-4 w-4 shrink-0 text-[var(--attention,#C99116)]" /><p className="min-w-0 text-[13px]"><span className="font-medium">Joon suggested:</span> {proposal.instruction}</p><div className="flex rounded-lg border border-[var(--attention,#C99116)]/40 bg-white/50 p-0.5" aria-label="Compare email suggestion">{(["before", "proposed"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} disabled={item === "proposed" && Boolean(notice)} aria-pressed={view === item} className={cn("rounded-md px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17204D] disabled:opacity-40", view === item && "bg-white shadow-sm")}>{item === "before" ? "Current draft" : "Joon's suggestion"}</button>)}</div></div><div className="flex items-center gap-2"><button type="button" onClick={reject} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-1.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17204D] disabled:opacity-40"><X className="h-3.5 w-3.5" />Reject</button><button type="button" onClick={accept} disabled={pending || Boolean(notice)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#17204D] px-3 py-1.5 text-[12px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17204D] focus-visible:ring-offset-2 disabled:opacity-40">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept change</button></div></div>{notice ? <p role="status" className="mt-2 text-[12px] leading-5 text-foreground">{notice}</p> : null}</div>;
}

function CodePanel({ selected, code, setCode, apply }: { selected: EmailBlock | null; code: string; setCode: (value: string) => void; apply: () => void }) { return <div className="p-4"><PanelHeading eyebrow="Structured code" title={selected ? blockTitle(selected) : "Select a block"} description="Edit the selected block as validated JSON. Use a Custom HTML block for precise email-safe markup." /><textarea value={code} onChange={(event) => setCode(event.target.value)} disabled={!selected} spellCheck={false} className="mt-5 min-h-[430px] w-full resize-y rounded-xl border border-border bg-[#171717] p-3 font-mono text-[12px] leading-5 text-[#F4F2EC] outline-none focus:border-[var(--attention,#C99116)] disabled:opacity-40" /><button type="button" onClick={apply} disabled={!selected} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17204D] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"><Code2 className="h-4 w-4" />Apply code</button></div>; }
function PreflightPanel({ preflight }: { preflight: ReturnType<typeof preflightEmail> }) { return <div className="p-4"><PanelHeading eyebrow="Exact artifact" title={`${preflight.passed} of ${preflight.checks.length} checks pass`} description="These checks run against the same structured email used for preview and delivery." /><div className="mt-5 space-y-2">{preflight.checks.map((check) => <div key={check.label} className="flex gap-3 rounded-xl border border-border p-3"><span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", check.ok ? "bg-[var(--success-soft,#E5F4EE)] text-[#157858]" : "bg-[var(--risk-soft,#FAE8E4)] text-[var(--risk,#B95849)]")}>{check.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</span><div><p className="text-[13px] font-medium">{check.label}</p><p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{check.detail}</p></div></div>)}</div><div className="mt-4 rounded-xl border border-[var(--evidence,#2D4F9E)]/30 bg-[var(--evidence-soft,#E9EFFF)] p-3 text-[12px] leading-5"><strong>Approval happens on the campaign.</strong> Saving here creates the email version; campaign approval freezes this version with its audience, offer and delivery plan.</div></div>; }

function BlockPicker({ onAdd }: { onAdd: (type: EmailBlockType) => void }) { return <div className="border-b border-border bg-[var(--surface,#FFFDF8)] p-2">{ADDABLE.map((item) => <button key={item.type} type="button" onClick={() => onAdd(item.type)} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-[var(--attention-soft,#FFF0B8)]"><Plus className="h-3.5 w-3.5" />{item.label}</button>)}</div>; }
function EnvelopeField({ label, value, readOnly, placeholder, onChange }: { label: string; value: string; readOnly?: boolean; placeholder?: string; onChange: (value: string) => void }) { return <label className="min-w-0"><span className="mb-1 block text-[12px] font-medium text-muted-foreground">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} placeholder={placeholder} className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[14px] outline-none focus:border-[var(--evidence,#2D4F9E)] read-only:opacity-70" /></label>; }
function ContextSection({ title, description, sectionKey, children }: { title: string; description?: string; sectionKey?: string; children: React.ReactNode }) {
  return <section data-panel-section={sectionKey} aria-label={title} className="border-t border-border px-4 py-4 scroll-mt-2"><h3 className="text-[14px] font-medium">{title}</h3>{description ? <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{description}</p> : null}<div className="mt-3">{children}</div></section>;
}
function PanelHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--evidence,#2D4F9E)]">{eyebrow}</p><h2 className="mt-1 text-[19px] font-medium tracking-[-0.01em]">{title}</h2><p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p></div>; }

function IconButton({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) { return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-lg border border-border bg-[var(--surface,#FFFDF8)] p-2 text-muted-foreground hover:text-foreground disabled:opacity-30">{children}</button>; }
