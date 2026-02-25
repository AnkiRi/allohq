"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X, Save, Eye, GripVertical, Loader2, Check } from "lucide-react";
import { cn } from "@allohq/ui";
import { createDefaultBlock } from "@allohq/email-builder";
import type { EmailBlock, EmailBlockType } from "@allohq/email-builder";

import { BlockPalette } from "./BlockPalette";
import { PropertyPanel } from "./PropertyPanel";
import { PreviewPane } from "./PreviewPane";

// ---------------------------------------------------------------------------
// Simplified block preview renderer for the canvas
// ---------------------------------------------------------------------------

function BlockPreview({ block }: { block: EmailBlock }) {
  switch (block.type) {
    case "text":
      return (
        <div
          className="text-sm font-mono text-gray-700 leading-relaxed"
          style={{ textAlign: block.props.align || "left", fontSize: block.props.fontSize }}
          dangerouslySetInnerHTML={{ __html: block.props.html }}
        />
      );

    case "image":
      return block.props.src ? (
        <div style={{ textAlign: block.props.align || "center" }}>
          <img
            src={block.props.src}
            alt={block.props.alt || ""}
            className="max-w-full h-auto rounded"
            style={{
              width: block.props.width ? `${block.props.width}px` : undefined,
              height: block.props.height ? `${block.props.height}px` : undefined,
            }}
          />
        </div>
      ) : (
        <div className="h-24 bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center">
          <span className="text-xs font-mono text-gray-400">Image placeholder</span>
        </div>
      );

    case "button":
      return (
        <div style={{ textAlign: block.props.align || "center" }}>
          <span
            className="inline-block px-6 py-2 text-sm font-mono font-medium rounded"
            style={{
              backgroundColor: block.props.bgColor || "#000000",
              color: block.props.textColor || "#FFFFFF",
              borderRadius: block.props.borderRadius ? `${block.props.borderRadius}px` : "4px",
              width: block.props.fullWidth ? "100%" : undefined,
            }}
          >
            {block.props.text}
          </span>
        </div>
      );

    case "divider":
      return (
        <hr
          style={{
            borderColor: block.props.color || "#E5E7EB",
            borderTopWidth: block.props.thickness || 1,
            margin: `${block.props.margin || 16}px 0`,
          }}
        />
      );

    case "spacer":
      return (
        <div
          className="flex items-center justify-center"
          style={{ height: block.props.height }}
        >
          <span className="text-[10px] font-mono text-gray-300">
            {block.props.height}px
          </span>
        </div>
      );

    case "product":
      return (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          {block.props.showImage !== false && block.props.imageUrl ? (
            <img src={block.props.imageUrl} alt={block.props.title || ""} className="w-12 h-12 object-cover rounded" />
          ) : (
            <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-mono text-gray-400">IMG</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-gray-700 font-bold truncate">
              {block.props.title || block.props.productId || "Product"}
            </p>
            {block.props.showPrice !== false && block.props.price != null && (
              <p className="text-[10px] font-mono text-gray-500">${Number(block.props.price).toFixed(2)}</p>
            )}
            {block.props.showDescription !== false && block.props.description && (
              <p className="text-[10px] font-mono text-gray-400 truncate">{block.props.description}</p>
            )}
            <span className="inline-block mt-1 px-2 py-0.5 bg-gray-900 text-white text-[10px] font-mono rounded">
              {block.props.buttonText || "Shop Now"}
            </span>
          </div>
        </div>
      );

    case "product_grid":
      return (
        <div className="p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-xs font-mono text-gray-500 text-center">
            Product Grid ({block.props.productIds.length} products, {block.props.columns || 2} columns)
          </p>
        </div>
      );

    case "columns":
      return (
        <div className="flex gap-2">
          {block.props.columns.map((col: EmailBlock[], i: number) => (
            <div
              key={i}
              className="flex-1 min-h-[40px] bg-gray-50 rounded border border-dashed border-gray-300 flex items-center justify-center"
            >
              <span className="text-[10px] font-mono text-gray-400">
                Col {i + 1} ({col.length} blocks)
              </span>
            </div>
          ))}
        </div>
      );

    case "header":
      return (
        <div
          className="p-3 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: block.props.bgColor || "#FFFFFF" }}
        >
          {block.props.logoSrc ? (
            <img src={block.props.logoSrc} alt={block.props.logoAlt || "Logo"} className="h-8" />
          ) : (
            <span className="text-xs font-mono text-gray-400">Header / Logo</span>
          )}
        </div>
      );

    case "footer":
      return (
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-[11px] font-mono text-gray-500 line-clamp-2">
            {block.props.text}
          </p>
          {block.props.unsubscribeText && (
            <p className="text-[10px] font-mono text-gray-400 underline mt-1">
              {block.props.unsubscribeText}
            </p>
          )}
        </div>
      );

    case "social":
      return (
        <div className="flex items-center justify-center gap-2 p-2">
          <span className="text-xs font-mono text-gray-400">
            Social links ({block.props.links.length})
          </span>
        </div>
      );

    default:
      return (
        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-xs font-mono text-gray-400">Unknown block</p>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Sortable block wrapper
// ---------------------------------------------------------------------------

function SortableBlock({
  block,
  isSelected,
  onSelect,
  onDelete,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "group relative rounded-lg border bg-white transition-all",
        isSelected
          ? "border-gray-900 ring-1 ring-gray-900"
          : "border-gray-200 hover:border-gray-400",
        isDragging && "opacity-40"
      )}
    >
      {/* Drag handle + delete button */}
      <div className="absolute -left-px top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity -translate-x-full pr-1">
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute -right-px top-1 opacity-0 group-hover:opacity-100 transition-opacity translate-x-full pl-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Block type label */}
      <div className="px-3 py-1.5 border-b border-gray-100">
        <span className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider">
          {block.type}
        </span>
      </div>

      {/* Block preview */}
      <div className="px-3 py-2">
        <BlockPreview block={block} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas drop zone
// ---------------------------------------------------------------------------

function CanvasDropZone({ children, isEmpty }: { children: React.ReactNode; isEmpty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas-drop-zone" });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-h-[200px] rounded-xl border-2 border-dashed transition-colors p-4",
        isOver
          ? "border-gray-400 bg-gray-50"
          : isEmpty
            ? "border-gray-200 bg-gray-50/50"
            : "border-transparent bg-transparent"
      )}
    >
      {isEmpty ? (
        <div className="flex items-center justify-center h-full min-h-[200px]">
          <p className="text-sm font-mono text-gray-400">
            Drag blocks here to start building
          </p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmailCanvas (main builder)
// ---------------------------------------------------------------------------

interface EmailCanvasProps {
  initialBlocks?: EmailBlock[];
  onSave: (blocks: EmailBlock[]) => void | Promise<void>;
  templateId?: string;
}

/** Ensure all blocks have unique IDs (AI sometimes generates duplicates) */
function deduplicateBlockIds(blocks: EmailBlock[]): EmailBlock[] {
  const seen = new Set<string>();
  return blocks.map((block) => {
    let id = block.id;
    if (!id || seen.has(id)) {
      id = `blk-${crypto.randomUUID().slice(0, 8)}`;
    }
    seen.add(id);
    return { ...block, id };
  });
}

export function EmailCanvas({ initialBlocks = [], onSave, templateId: _templateId }: EmailCanvasProps) {
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => deduplicateBlockIds(initialBlocks));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  // Auto-clear success/error status after 2s
  useEffect(() => {
    if (saveStatus !== "idle") {
      const t = setTimeout(() => setSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [saveStatus]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      await onSave(blocks);
      setSaveStatus("success");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [blocks, onSave]);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId) ?? null;

  // ---- Block operations ---------------------------------------------------

  const handleUpdateBlock = useCallback((updated: EmailBlock) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === updated.id ? updated : b))
    );
  }, []);

  const handleDeleteBlock = useCallback((id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedBlockId((prev) => (prev === id ? null : prev));
  }, []);

  // ---- DnD handlers ------------------------------------------------------

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Drag from palette -> canvas
    if (activeId.startsWith("palette-")) {
      const blockType = active.data.current?.type as EmailBlockType | undefined;
      if (!blockType) return;

      const newBlock = createDefaultBlock(blockType, crypto.randomUUID());

      // If dropped over a specific block, insert after it; otherwise append
      const overIndex = blocks.findIndex((b) => b.id === overId);
      if (overIndex >= 0) {
        setBlocks((prev) => {
          const next = [...prev];
          next.splice(overIndex + 1, 0, newBlock);
          return next;
        });
      } else {
        setBlocks((prev) => [...prev, newBlock]);
      }

      setSelectedBlockId(newBlock.id);
      return;
    }

    // Reorder within canvas
    if (activeId !== overId) {
      setBlocks((prev) => {
        const oldIndex = prev.findIndex((b) => b.id === activeId);
        const newIndex = prev.findIndex((b) => b.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, [blocks]);

  // ---- Render -------------------------------------------------------------

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full bg-gray-50">
        {/* Left: Block Palette */}
        <BlockPalette />

        {/* Center: Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold font-mono text-gray-900 tracking-wider uppercase">
                Canvas
              </h2>
              <span className="text-xs font-mono text-gray-400">
                {blocks.length} block{blocks.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-mono text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-mono transition-all disabled:opacity-70",
                  saveStatus === "success"
                    ? "bg-green-600 text-white"
                    : saveStatus === "error"
                      ? "bg-red-600 text-white"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                )}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saveStatus === "success" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? "Saving..." : saveStatus === "success" ? "Saved!" : saveStatus === "error" ? "Error" : "Save"}
              </button>
            </div>
          </div>

          {/* Canvas scroll area */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto" style={{ maxWidth: 640 }}>
              <CanvasDropZone isEmpty={blocks.length === 0}>
                <SortableContext
                  items={blocks.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {blocks.map((block) => (
                      <SortableBlock
                        key={block.id}
                        block={block}
                        isSelected={block.id === selectedBlockId}
                        onSelect={() => setSelectedBlockId(block.id)}
                        onDelete={() => handleDeleteBlock(block.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </CanvasDropZone>
            </div>
          </div>
        </div>

        {/* Right: Property Panel */}
        <PropertyPanel
          selectedBlock={selectedBlock}
          onUpdate={handleUpdateBlock}
        />

        {/* Preview modal */}
        <PreviewPane
          blocks={blocks}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
        />
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDragId && activeDragId.startsWith("palette-") ? (
          <div className="px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-lg text-sm font-mono text-gray-700">
            {activeDragId.replace("palette-", "")}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
