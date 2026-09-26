"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Check, Code2, FileClock, ImagePlus, Inspect, Loader2,
  MessageSquareText, PanelLeft, PanelLeftClose, PanelRightClose, Plus, Send, ShieldCheck, ShoppingBag, Sparkles, X,
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
import { ScopeChooser, type AskScope } from "./AskScope";
import { VisualProposalCard, type VisualProposal } from "./VisualProposalCard";
import { ShopifyDataPanel } from "./ShopifyDataPanel";
import { VisualGenerator, type GeneratedVisual, type VisualFailure, type VisualMode, type VisualSlotDraft } from "./VisualGenerator";
import { VisualActions } from "./VisualActions";
import { BlockEditor } from "./BlockEditor";
import { EmailPreviewFrame } from "./EmailPreviewFrame";
import { placeUploadedImage } from "./upload-placement";
import { placeProposalVisual } from "./visual-proposal-placement";

type StudioTab = "ask" | "inspect" | "shopify" | "visuals" | "versions" | "code" | "preflight";
type Snapshot = { id: string; label: string; createdAt: Date; blocks: EmailBlock[]; subject: string; previewText: string };
type Proposal = { id?: string; blocks: EmailBlock[]; subject: string; previewText: string; instruction: string; createdAt: Date; baseSignature: string; stale?: boolean };
type DurableVersion = { id: string; sequence: number; source: string; note?: string | null; createdAt: string | Date; document: unknown };
type ProposalHistoryItem = { id: string; instruction: string; scope?: string | null; status: string; createdAt: string | Date; resolvedAt?: string | Date | null };
type PendingProposal = { id: string; instruction: string; createdAt: string | Date; stale: boolean; candidate: { blocks: EmailBlock[]; envelope: { subject: string; previewText: string } } };

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
  const draftSignature = JSON.stringify({ blocks, subject, previewText });
  const draftSignatureRef = React.useRef(draftSignature);
  draftSignatureRef.current = draftSignature;
  const [selectedId, setSelectedId] = React.useState<string | null>(initialBlocks[0]?.id ?? null);
  const [html, setHtml] = React.useState(initialHtml);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewModalHtml, setPreviewModalHtml] = React.useState<string | null>(null);
  const [previewModalError, setPreviewModalError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<StudioTab>("ask");
  const [compactPanelOpen, setCompactPanelOpen] = React.useState(false);
  const [outlineOpen, setOutlineOpen] = React.useState(true);
  const [toolsOpen, setToolsOpen] = React.useState(true);
  const askInputRef = React.useRef<HTMLTextAreaElement>(null);
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const utils = trpc.useUtils();
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
    { id: "hero", label: "Clean hero", prompt: "" },
    { id: "lifestyle", label: "In use", prompt: "" },
    { id: "crop", label: "Close crop", prompt: "" },
    { id: "backdrop", label: "Campaign backdrop", prompt: "" },
  ]);
  const [visuals, setVisuals] = React.useState<GeneratedVisual[]>([]);
  const [visualFailures, setVisualFailures] = React.useState<VisualFailure[]>([]);
  const [visualProposal, setVisualProposal] = React.useState<VisualProposal | null>(null);
  const [visualTarget, setVisualTarget] = React.useState<VisualProposal["target"] | null>(null);
  const [visualTargetDescription, setVisualTargetDescription] = React.useState<string | null>(null);
  const [visualProductHasImage, setVisualProductHasImage] = React.useState(false);
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
  const [dirty, setDirty] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [versions, setVersions] = React.useState<Snapshot[]>([
    { id: "opened", label: "Opened in studio", createdAt: new Date(), blocks: cloneBlocks(initialBlocks), subject: initialSubject, previewText: initialPreviewText },
  ]);
  const [versionCursor, setVersionCursor] = React.useState(0);
  const [codeDraft, setCodeDraft] = React.useState("");
  const [assetUploading, setAssetUploading] = React.useState(false);
  const assetUploadInputRef = React.useRef<HTMLInputElement>(null);
  const uploadTargetIdRef = React.useRef<string | null>(null);
  const { toast } = useToast();
  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const effectiveBlocks = proposal && proposalView === "proposed" ? proposal.blocks : blocks;
  const effectiveSubject = proposal && proposalView === "proposed" ? proposal.subject : subject;
  const effectivePreviewText = proposal && proposalView === "proposed" ? proposal.previewText : previewText;
  const proposalNotice = proposal?.stale
    ? "This proposal was made for an older saved email. Reject it and ask Joon again."
    : proposal && draftSignature !== proposal.baseSignature
      ? "The draft changed after this proposal. Reject it and ask Joon again."
      : proposal && JSON.stringify({ blocks: proposal.blocks, subject: proposal.subject, previewText: proposal.previewText }) === proposal.baseSignature
        ? "Joon made no visible change. Reject this proposal and try another instruction."
        : null;
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
  const [libraryOpen, setLibraryOpen] = React.useState(false);
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
    { templateId }, { enabled: activeTab === "visuals" },
  ) as { data?: import("./VisualGenerator").VisualCapabilities };

  /** The product the selected block is about, if any — visuals are grounded in it. */
  const blockProductId = selected && (selected.type === "product")
    ? (selected.props.productId || null)
    : (blocks.find((block) => block.type === "product") as any)?.props?.productId ?? null;
  const blockProduct = blockProductId
    ? (productPage?.products ?? []).find((product) => product.id === blockProductId) ?? null
    : null;

  const generateVisuals = (requestedSlots = visualSlots, requestedMode = visualMode) => {
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
    setVisualFailures([]);
    generateVisualsMut.mutate(
      { storeId, templateId, productId: blockProductId ?? undefined, mode: requestedMode, slots },
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
    setVisualTargetDescription(visualProposal.targetDescription);
    setVisualProductHasImage(Boolean(visualProposal.product?.hasImage));
    setVisuals([]);
    setVisualFailures([]);
    setAdvancedVisuals(true);
    setActiveTab("visuals");
    generateVisuals([slot], visualProposal.mode);
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
      setDirty(true);
      setVisualTarget(null);
      setVisualTargetDescription(null);
      setVisualProductHasImage(false);
      setVisuals([]);
      setActiveTab("inspect");
      toast("Visual placed in the email. Save the version to keep it.", "success");
      return;
    }
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
   * Place a picture the merchant chose from the library.
   *
   * A product block is refused on purpose: its image is the product's own
   * Shopify photograph. Letting a chosen picture sit there would make the
   * block stop being a record of the product.
   */
  const useLibraryItem = (item: { url: string; label: string; altText?: string | null }) => {
    if (!selected) { toast("Select an image or hero block first.", "error"); return; }
    if (selected.type === "image") {
      updateBlock({ ...selected, props: { ...selected.props, src: item.url, alt: item.altText || item.label } } as EmailBlock);
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
   * Create a campaign visual FROM a product, as a new block above it.
   *
   * Never into the product block: its picture is resolved from Shopify at send
   * time, so anything placed there shows in preview and is replaced on the way
   * out.
   */
  const createProductScene = () => {
    if (!selected) return;
    const imageBlock = createDefaultBlock("image", newId("image"));
    const index = blocks.findIndex((block) => block.id === selected.id);
    const next = [...blocks];
    next.splice(Math.max(0, index), 0, imageBlock);
    setBlocks(next);
    setSelectedId(imageBlock.id);
    setDirty(true);
    setAdvancedVisuals(true);
    toast("Added an image block above the product. Its own photo is untouched.", "success");
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
    const submittedSignature = draftSignature;
    const savedDocument = { blocks: validated.data, subject, previewText };
    saveMut.mutate({ id: templateId, subject, previewText, blocks: validated.data }, {
      onSuccess: (saved) => {
        createCheckpoint("Saved version", savedDocument);
        if (draftSignatureRef.current === submittedSignature) setDirty(false);
        setSavedAt(new Date());
        (utils.templates.getById as any).setData({ id: templateId }, (current: any) => current ? { ...current, ...saved } : current);
        void utils.templates.getById.invalidate({ id: templateId });
        void utils.templates.list.invalidate();
        void utils.campaigns.getById.invalidate();
        void durableVersionsQuery.refetch();
        toast("Saved as a recoverable version.", "success");
      },
      onError: (error) => toast(error.message ?? "Could not save this email.", "error"),
    });
  };
  const openFullPreview = () => {
    setPreviewOpen(true);
    setPreviewModalHtml(null);
    setPreviewModalError(null);
    renderMut.mutate({ blocks: effectiveBlocks, subject: effectiveSubject, previewText: effectivePreviewText, variables: previewVariables, brandKit, storeId }, {
      onSuccess: (data: { html: string }) => setPreviewModalHtml(data.html),
      onError: () => setPreviewModalError("Joon couldn't render this preview. Your edits are still here; close this view and try again."),
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
    const apply = () => { createCheckpoint(`Joon · ${proposal.instruction}`, proposal); setBlocks(cloneBlocks(proposal.blocks)); setSubject(proposal.subject); setPreviewText(proposal.previewText); setSelectedId(proposal.blocks.some((block) => block.id === selectedId) ? selectedId : proposal.blocks[0]?.id ?? null); setProposal(null); setDirty(!proposal.id); setSavedAt(proposal.id ? new Date() : savedAt); if (proposal.id) { void durableVersionsQuery.refetch(); void proposalHistoryQuery.refetch(); } };
    if (!proposal.id) { apply(); return; }
    resolveProposalMut.mutate({ proposalId: proposal.id, decision: "accepted" }, { onSuccess: () => { apply(); void pendingProposalQuery.refetch(); }, onError: (error: { message?: string }) => toast(error.message ?? "Could not accept this proposal.", "error") });
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
        const nextBlocks = data.template.blocks as EmailBlock[];
        setBlocks(cloneBlocks(nextBlocks)); setSubject(data.template.subject); setPreviewText(data.template.previewText ?? ""); setSelectedId(nextBlocks[0]?.id ?? null); setProposal(null); setDirty(false); setSavedAt(new Date()); void durableVersionsQuery.refetch(); toast("Restored as a new version.", "success");
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
      setSelectedAssetIds((current) => [...new Set([...current, asset.id])]);
      await creativeAssetsQuery.refetch();
      void libraryQuery.refetch();
      const target = blocks.find((block) => block.id === targetBlockId);
      if (target?.type === "image" || target?.type === "hero") {
        setBlocks((current) => current.map((block) => placeUploadedImage(block, targetBlockId!, asset.url, file.name)));
        setDirty(true);
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
        canUndo={versionCursor > 0}
        canRedo={versionCursor < versions.length - 1}
        onUndo={() => restoreVersion(Math.max(0, versionCursor - 1))}
        onRedo={() => restoreVersion(Math.min(versions.length - 1, versionCursor + 1))}
        onPreview={openFullPreview}
        onSave={saveDraft}
        saving={saveMut.isPending}
        reviewHref={reviewHref ?? null}
        reviewBlocked={dirty || saveMut.isPending}
        onAddBlock={() => setShowAdd((value) => !value)}
        onOpenTools={() => setCompactPanelOpen(true)}
        onBack={leaveStudio}
      />
      {proposal ? <ProposalBar proposal={proposal} view={proposalView} setView={setProposalView} reject={rejectProposal} accept={acceptProposal} pending={resolveProposalMut.isPending} notice={proposalNotice} /> : null}
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
          <div className="min-h-0 flex-1 overflow-y-auto"><BlockList blocks={blocks} selectedId={selectedId} onSelect={(blockId) => { setSelectedId(blockId); setActiveTab("inspect"); }} onMove={move} onRemove={remove} blockTitle={nameOf} /></div>
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
              <button type="button" onClick={() => setToolsOpen(false)} aria-label="Hide tools panel" aria-expanded={true} title="Hide tools panel" className={cn("ml-1 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:border-[#2D4F9E] hover:bg-[#E9EFFF] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2D4F9E]", isDesktop ? "inline-flex" : "hidden")}><PanelRightClose className="h-3.5 w-3.5" />Hide</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === "ask" ? <AskPanel visualProposal={visualProposal} onVisualGenerate={generateProposedVisual} onVisualRefine={() => { setInstruction(visualProposal?.instruction ?? ""); setVisualProposal(null); }} onVisualCancel={() => setVisualProposal(null)} inputRef={askInputRef} selected={selected} scope={askScope} setScope={setAskScope} instruction={instruction} setInstruction={setInstruction} pending={promptMut.isPending} error={promptError} assets={creativeAssets} selectedAssetIds={selectedAssetIds} setSelectedAssetIds={setSelectedAssetIds} onAsk={askJoon} onUpload={uploadAsset} uploading={assetUploading} history={proposalHistoryQuery.data ?? []} /> : null}
            {insertReceipt ? <p role="status" className="mx-4 mt-3 rounded-lg border border-[#157858]/30 bg-[#E5F4EE] px-2.5 py-1.5 text-[12px] text-[#157858]">{insertReceipt}</p> : null}
            {activeTab === "inspect" ? <InspectorPanel selected={selected} updateBlock={updateBlock} products={productPage?.products ?? []} onOpenVisuals={() => { setActiveTab("visuals"); setAdvancedVisuals(false); }} onUploadImage={() => openUploadPicker()} onChooseAsset={() => setLibraryOpen(true)} /> : null}
            {activeTab === "shopify" ? <ShopifyDataPanel selected={selected} products={(productPage?.products ?? []) as any} collections={(storeCollections ?? []) as any} variants={(productVariants ?? []) as any} storeConnected={!!storeId} onBindProduct={bindProduct} onBindVariant={bindVariant} onToggleGridProduct={toggleGridProduct} onBindCollection={bindCollection} onInsertToken={insertToken} /> : null}
            {activeTab === "visuals" && !advancedVisuals ? (
              <VisualActions
                selected={selected}
                capabilities={visualCapabilities ?? null}
                productTitle={blockProduct?.title ?? null}
                onGenerate={() => { setVisualTarget(null); setVisualTargetDescription(null); setAdvancedVisuals(true); }}
                onUpload={() => openUploadPicker()}
                onChooseFromLibrary={() => setLibraryOpen(true)}
                onCreateProductScene={createProductScene}
                onOpenAdvanced={() => { setVisualTarget(null); setVisualTargetDescription(null); setAdvancedVisuals(true); }}
              />
            ) : null}
            {activeTab === "visuals" && advancedVisuals ? <VisualGenerator mode={visualMode} setMode={setVisualMode} slots={visualSlots} setSlots={setVisualSlots} productTitle={blockProduct?.title ?? null} productHasImage={visualTarget ? visualProductHasImage : Boolean(blockProduct?.imageUrl)} capabilities={visualCapabilities ?? null} results={visuals} failures={visualFailures} pending={generateVisualsMut.isPending} placementDescription={visualTargetDescription} onGenerate={() => generateVisuals()} onUseAsset={useVisual} /> : null}
            {activeTab === "versions" ? <VersionsPanel versions={versions} cursor={versionCursor} restore={restoreVersion} durableVersions={durableVersionsQuery.data ?? []} restoreDurable={restoreDurableVersion} restoring={restoreVersionMut.isPending} /> : null}
            {activeTab === "code" ? <CodePanel selected={selected} code={codeDraft} setCode={setCodeDraft} apply={applyCode} /> : null}
            {activeTab === "preflight" ? <PreflightPanel preflight={preflight} /> : null}
          </div>
        </aside>
      </div>

      {libraryOpen ? (
        <AssetLibraryDialog
          library={libraryQuery.data ?? null}
          loading={libraryQuery.isLoading}
          initialTab={selected?.type === "product" ? "shopify" : undefined}
          onClose={() => setLibraryOpen(false)}
          onSelect={useLibraryItem}
          onUpload={() => openUploadPicker()}
          onGenerate={() => { setLibraryOpen(false); setActiveTab("visuals"); setAdvancedVisuals(false); }}
        />
      ) : null}
      <Dialog.Root open={previewOpen} onOpenChange={setPreviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-[#171717]/70" />
          <Dialog.Content className="fixed inset-x-3 bottom-3 top-3 z-50 mx-auto flex max-w-5xl flex-col overflow-hidden rounded-xl bg-[#FFFDF8] shadow-2xl outline-none sm:inset-y-[4vh]" aria-describedby="studio-preview-description">
            <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-[15px] font-medium">Full email preview</Dialog.Title>
                <Dialog.Description id="studio-preview-description" className="mt-1 truncate text-[12px] text-muted-foreground">{effectiveSubject || "Untitled subject"} · {dirty ? "Unsaved changes" : "Saved version"}</Dialog.Description>
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
  return <div className="shrink-0 border-b border-[var(--attention,#C99116)]/30 bg-[var(--attention-soft,#FFF0B8)] px-5 py-2.5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-3"><Sparkles className="h-4 w-4 shrink-0 text-[var(--attention,#C99116)]" /><p className="min-w-0 text-[13px]"><span className="font-medium">Joon proposed:</span> {proposal.instruction}</p><div className="flex rounded-lg border border-[var(--attention,#C99116)]/40 bg-white/50 p-0.5" aria-label="Compare email proposal">{(["before", "proposed"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} aria-pressed={view === item} className={cn("rounded-md px-2.5 py-1 text-[12px] capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17204D]", view === item && "bg-white shadow-sm")}>{item}</button>)}</div></div><div className="flex items-center gap-2"><button type="button" onClick={reject} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/70 px-3 py-1.5 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17204D] disabled:opacity-40"><X className="h-3.5 w-3.5" />Reject</button><button type="button" onClick={accept} disabled={pending || Boolean(notice)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#17204D] px-3 py-1.5 text-[12px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17204D] focus-visible:ring-offset-2 disabled:opacity-40">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept change</button></div></div>{notice ? <p role="status" className="mt-2 text-[12px] leading-5 text-foreground">{notice}</p> : null}</div>;
}

function AskPanel({ visualProposal, onVisualGenerate, onVisualRefine, onVisualCancel, inputRef, selected, scope, setScope, instruction, setInstruction, pending, error, assets, selectedAssetIds, setSelectedAssetIds, onAsk, onUpload, uploading, history }: { visualProposal: VisualProposal | null; onVisualGenerate: () => void; onVisualRefine: () => void; onVisualCancel: () => void; inputRef: React.RefObject<HTMLTextAreaElement | null>; selected: EmailBlock | null; scope: AskScope; setScope: (value: AskScope) => void; instruction: string; setInstruction: (value: string) => void; pending: boolean; error: string | null; assets: Array<{ id: string; fileName: string; type: string }>; selectedAssetIds: string[]; setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>; onAsk: (text?: string, scope?: "subject" | "copy" | "visual" | "tone") => void; onUpload: (file: File) => void; uploading: boolean; history: ProposalHistoryItem[] }) {
  /**
   * Suggestions that make sense for what is selected.
   *
   * "Try a stronger visual" on a PRODUCT block was answered by hiding the
   * product image — technically a presentation change Joon is allowed to make,
   * and exactly not what the merchant asked for. A product block's picture is
   * a Shopify fact, so the chips here are about wording and layout, and
   * imagery is directed from the Visuals tab where the real controls live.
   */
  const suggestions = !selected
    ? ["Make the email more visual", "Tighten the whole email", "Try a warmer direction", "Create a fresh layout"]
    : selected.type === "product" || selected.type === "product_grid"
    ? ["Make this clearer", "Shorten this block", "Match our brand voice", "Stronger call to action"]
    : selected.type === "image" || selected.type === "hero"
    ? ["Make this clearer", "Match our brand voice", "Shorten this block"]
    : ["Make this clearer", "Shorten this block", "Match our brand voice", "Warmer tone"];
  return <div className="flex min-h-full flex-col"><div className="p-4"><PanelHeading eyebrow="Ask Joon" title={selected ? blockTitle(selected) : "This email"} description="Every result arrives as a proposal you accept or reject. Nothing changes until you do." /><ScopeChooser scope={scope} setScope={setScope} selectedTitle={selected ? blockTitle(selected) : null} />{visualProposal ? <VisualProposalCard proposal={visualProposal} onGenerate={onVisualGenerate} onRefine={onVisualRefine} onCancel={onVisualCancel} /> : null}{history.length ? <div className="mt-5 space-y-2 border-l border-border pl-3">{history.slice(-8).map((item) => <div key={item.id} className="rounded-r-xl bg-[#F4F2EC] p-2.5"><div className="flex items-start justify-between gap-2"><p className="text-[12px] leading-5">{item.instruction}</p><span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px]", item.status === "accepted" ? "bg-[var(--success-soft,#E5F4EE)] text-[#157858]" : item.status === "rejected" ? "bg-[var(--risk-soft,#FAE8E4)] text-[var(--risk,#B95849)]" : "bg-[var(--attention-soft,#FFF0B8)] text-foreground")}>{item.status}</span></div><p className="mt-1 text-[10px] text-muted-foreground">Joon prepared a reviewable change · {new Date(item.createdAt).toLocaleString()}</p></div>)}</div> : <div className="mt-5 rounded-xl border border-border bg-[#F4F2EC] p-3"><div className="flex gap-2.5"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#17204D] text-[11px] font-medium text-white">J</div><p className="text-[13px] leading-5">Tell me what should change. I’ll keep the current version intact and show you the proposal before anything is applied.</p></div></div>}<div className="mt-3 flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onAsk(suggestion)} disabled={pending} className="rounded-full border border-border px-2.5 py-1 text-[12px] hover:border-[var(--attention,#C99116)] hover:bg-[var(--attention-soft,#FFF0B8)] disabled:opacity-40">{suggestion}</button>)}</div><div className="mt-5"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-[12px] font-medium">Reference assets</p><label className="cursor-pointer rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-[#F4F2EC]"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file); event.currentTarget.value = ""; }} />{uploading ? "Uploading…" : "+ Upload"}</label></div><div className="flex flex-wrap gap-1.5">{assets.map((asset) => { const active = selectedAssetIds.includes(asset.id); return <button key={asset.id} type="button" onClick={() => setSelectedAssetIds((current) => active ? current.filter((id) => id !== asset.id) : [...current, asset.id])} className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]", active ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)]" : "border-border")}><ImagePlus className="h-3.5 w-3.5" />{asset.fileName}</button>; })}{!assets.length ? <p className="text-[12px] text-muted-foreground">Upload a product or campaign reference, then ask Joon to use or transform it.</p> : null}</div></div></div><div className="sticky bottom-0 mt-auto border-t border-border bg-[var(--surface,#FFFDF8)] p-3"><div className="rounded-xl border border-border bg-white p-2 focus-within:border-[var(--evidence,#2D4F9E)]"><textarea ref={inputRef} value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onAsk(); } }} rows={4} placeholder={scope === "block" && selected ? `Ask Joon about “${blockTitle(selected)}”…` : scope === "envelope" ? "Ask Joon about the subject or inbox preview…" : "Ask Joon about the whole email…"} className="w-full resize-none bg-transparent px-1 text-[14px] leading-5 outline-none" /><div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Enter to propose · Shift Enter for a new line</span><button type="button" onClick={() => onAsk()} disabled={pending || !instruction.trim()} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#17204D] text-white disabled:opacity-40" aria-label="Ask Joon">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div></div>{error ? <p className="mt-2 text-[12px] text-[var(--risk,#B95849)]">{error}</p> : null}</div></div>;
}

function InspectorPanel({ selected, updateBlock, products, onOpenVisuals, onUploadImage, onChooseAsset }: { selected: EmailBlock | null; updateBlock: (block: EmailBlock) => void; onOpenVisuals?: () => void; onUploadImage?: () => void; onChooseAsset?: () => void; products: Array<{ id: string; title: string; description?: string | null; imageUrl?: string | null; price: number; handle: string }> }) {
  const bindProduct = (product: (typeof products)[number]) => {
    if (!selected) return;
    if (selected.type === "product") updateBlock({ ...selected, props: { ...selected.props, productId: product.id, source: "manual", title: product.title, description: product.description ?? undefined, imageUrl: product.imageUrl ?? undefined, price: product.price } });
    else if (selected.type === "product_grid") updateBlock({ ...selected, props: { ...selected.props, source: "manual", productIds: [...new Set([...selected.props.productIds, product.id])] } });
  };
  const supportsProducts = selected?.type === "product" || selected?.type === "product_grid";
  return <div className="p-4"><PanelHeading eyebrow="Selected element" title={selected ? blockTitle(selected) : "Nothing selected"} description={selected ? `Editing ${selected.type.replace("_", " ")} · click the canvas to choose another element.` : "Click any part of the email canvas."} />{supportsProducts && products.length ? <div className="mt-5"><p className="mb-2 text-[12px] font-medium">Store products</p><div className="max-h-64 space-y-1 overflow-y-auto">{products.map((product) => <button key={product.id} type="button" onClick={() => bindProduct(product)} className="flex w-full items-center gap-2 rounded-lg border border-transparent p-1.5 text-left hover:border-border hover:bg-[#F4F2EC]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-9 w-9 rounded-md object-cover" /> : <div className="h-9 w-9 rounded-md bg-[var(--surface-soft,#ECE9E1)]" />}<div className="min-w-0"><p className="truncate text-[12px] font-medium">{product.title}</p><p className="text-[11px] text-muted-foreground">{product.price.toLocaleString()}</p></div></button>)}</div></div> : null}<div className="mt-5"><BlockEditor block={selected} onUpdate={updateBlock} onOpenVisuals={onOpenVisuals} onUploadImage={onUploadImage} onChooseAsset={onChooseAsset} /></div></div>;
}
function VersionsPanel({ versions, cursor, restore, durableVersions, restoreDurable, restoring }: { versions: Snapshot[]; cursor: number; restore: (index: number) => void; durableVersions: DurableVersion[]; restoreDurable: (id: string) => void; restoring: boolean }) { return <div className="p-4"><PanelHeading eyebrow="Recoverable history" title="Versions" description="Manual and Joon changes share one history. Restoring creates a new version; nothing is erased." />{durableVersions.length ? <><p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Saved across sessions</p><div className="space-y-2">{durableVersions.map((version) => <button key={version.id} type="button" disabled={restoring} onClick={() => restoreDurable(version.id)} className="w-full rounded-xl border border-border p-3 text-left hover:bg-[#F4F2EC] disabled:opacity-40"><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium">Version {version.sequence} · {version.source}</span><span className="text-[11px] text-muted-foreground">{new Date(version.createdAt).toLocaleDateString()}</span></div><p className="mt-1 text-[12px] text-muted-foreground">{version.note ?? "Saved email artifact"}</p></button>)}</div></> : null}<p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">This session</p><div className="space-y-2">{[...versions].reverse().map((version, reverseIndex) => { const index = versions.length - reverseIndex - 1; return <button key={version.id} type="button" onClick={() => restore(index)} className={cn("w-full rounded-xl border p-3 text-left", index === cursor ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)]" : "border-border hover:bg-[#F4F2EC]")}><div className="flex items-center justify-between gap-3"><span className="text-[13px] font-medium">{version.label}</span><span className="text-[11px] text-muted-foreground">{version.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><p className="mt-1 text-[12px] text-muted-foreground">{version.blocks.length} blocks · {version.subject || "No subject"}</p></button>; })}</div></div>; }
function CodePanel({ selected, code, setCode, apply }: { selected: EmailBlock | null; code: string; setCode: (value: string) => void; apply: () => void }) { return <div className="p-4"><PanelHeading eyebrow="Structured code" title={selected ? blockTitle(selected) : "Select a block"} description="Edit the selected block as validated JSON. Use a Custom HTML block for precise email-safe markup." /><textarea value={code} onChange={(event) => setCode(event.target.value)} disabled={!selected} spellCheck={false} className="mt-5 min-h-[430px] w-full resize-y rounded-xl border border-border bg-[#171717] p-3 font-mono text-[12px] leading-5 text-[#F4F2EC] outline-none focus:border-[var(--attention,#C99116)] disabled:opacity-40" /><button type="button" onClick={apply} disabled={!selected} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#17204D] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"><Code2 className="h-4 w-4" />Apply code</button></div>; }
function PreflightPanel({ preflight }: { preflight: ReturnType<typeof preflightEmail> }) { return <div className="p-4"><PanelHeading eyebrow="Exact artifact" title={`${preflight.passed} of ${preflight.checks.length} checks pass`} description="These checks run against the same structured email used for preview and delivery." /><div className="mt-5 space-y-2">{preflight.checks.map((check) => <div key={check.label} className="flex gap-3 rounded-xl border border-border p-3"><span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", check.ok ? "bg-[var(--success-soft,#E5F4EE)] text-[#157858]" : "bg-[var(--risk-soft,#FAE8E4)] text-[var(--risk,#B95849)]")}>{check.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</span><div><p className="text-[13px] font-medium">{check.label}</p><p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{check.detail}</p></div></div>)}</div><div className="mt-4 rounded-xl border border-[var(--evidence,#2D4F9E)]/30 bg-[var(--evidence-soft,#E9EFFF)] p-3 text-[12px] leading-5"><strong>Approval happens on the campaign.</strong> Saving here creates the email version; campaign approval freezes this version with its audience, offer and delivery plan.</div></div>; }

function BlockPicker({ onAdd }: { onAdd: (type: EmailBlockType) => void }) { return <div className="border-b border-border bg-[var(--surface,#FFFDF8)] p-2">{ADDABLE.map((item) => <button key={item.type} type="button" onClick={() => onAdd(item.type)} className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-[var(--attention-soft,#FFF0B8)]"><Plus className="h-3.5 w-3.5" />{item.label}</button>)}</div>; }
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
