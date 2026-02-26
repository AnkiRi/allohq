"use client";

import { useDraggable } from "@dnd-kit/core";
import {
  Columns,
  Minus,
  Space,
  Type,
  ImageIcon,
  MousePointerClick,
  ShoppingBag,
  LayoutGrid,
  PanelTop,
  PanelBottom,
  Share2,
} from "lucide-react";
import { cn } from "@allohq/ui";
import type { EmailBlockType } from "@allohq/email-builder";

// ---------------------------------------------------------------------------
// Block definitions grouped by category
// ---------------------------------------------------------------------------

interface BlockDef {
  type: EmailBlockType;
  label: string;
  icon: React.ElementType;
}

const GROUPS: { label: string; items: BlockDef[] }[] = [
  {
    label: "Layout",
    items: [
      { type: "columns", label: "Columns", icon: Columns },
      { type: "divider", label: "Divider", icon: Minus },
      { type: "spacer", label: "Spacer", icon: Space },
    ],
  },
  {
    label: "Content",
    items: [
      { type: "text", label: "Text", icon: Type },
      { type: "image", label: "Image", icon: ImageIcon },
      { type: "button", label: "Button", icon: MousePointerClick },
    ],
  },
  {
    label: "E-Commerce",
    items: [
      { type: "product", label: "Product", icon: ShoppingBag },
      { type: "product_grid", label: "Product Grid", icon: LayoutGrid },
    ],
  },
  {
    label: "Branding",
    items: [
      { type: "header", label: "Header", icon: PanelTop },
      { type: "footer", label: "Footer", icon: PanelBottom },
      { type: "social", label: "Social", icon: Share2 },
    ],
  },
];

// ---------------------------------------------------------------------------
// DraggableBlockItem
// ---------------------------------------------------------------------------

function DraggableBlockItem({ def }: { def: BlockDef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${def.type}`,
    data: { type: def.type },
  });

  const Icon = def.icon;

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-mono",
        "text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
        "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span>{def.label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// BlockPalette (left sidebar)
// ---------------------------------------------------------------------------

export function BlockPalette() {
  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-[10px] font-bold text-foreground font-mono tracking-[1px] uppercase">
          Blocks
        </h2>
      </div>

      <div className="flex-1 px-2 py-3 space-y-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1 text-[10px] font-mono font-semibold text-muted-foreground tracking-wider uppercase">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((def) => (
                <DraggableBlockItem key={def.type} def={def} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
