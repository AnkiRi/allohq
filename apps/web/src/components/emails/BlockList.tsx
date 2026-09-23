"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { cn } from "@allohq/ui";
import type { EmailBlock } from "@allohq/email-builder";

/**
 * The list of blocks in the email, and the only way to reorder them.
 *
 * The previous version put move and delete behind `group-hover`, so the
 * controls did not exist for anyone using a keyboard, and the rows themselves
 * were unfocusable `<div onClick>`s. Reordering an email was mouse-only.
 *
 * Drag-and-drop is deliberately not used. It would need a parallel keyboard
 * path to be worth anything, and a well-made move control that works the same
 * for everyone beats a drag handle plus an afterthought. The controls stay
 * visible on hover AND on focus, and Alt+Arrow reorders from the keyboard
 * without leaving the row.
 */
export function BlockList({
  blocks,
  selectedId,
  onSelect,
  onMove,
  onRemove,
  blockTitle,
}: {
  blocks: EmailBlock[];
  selectedId: string | null;
  onSelect: (blockId: string) => void;
  onMove: (blockId: string, direction: -1 | 1) => void;
  onRemove: (blockId: string) => void;
  blockTitle: (block: EmailBlock) => string;
}) {
  const rowRefs = React.useRef(new Map<string, HTMLLIElement>());

  /** Keep focus on the block that moved, so a second press keeps moving it. */
  const focusRow = React.useCallback((blockId: string) => {
    window.requestAnimationFrame(() => rowRefs.current.get(blockId)?.focus());
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLLIElement>, block: EmailBlock, index: number) => {
    const last = blocks.length - 1;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      if ((direction === -1 && index === 0) || (direction === 1 && index === last)) return;
      onMove(block.id, direction);
      focusRow(block.id);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = blocks[event.key === "ArrowUp" ? Math.max(0, index - 1) : Math.min(last, index + 1)];
      if (next) rowRefs.current.get(next.id)?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(block.id);
    }
  };

  if (!blocks.length) {
    return (
      <p className="p-4 text-[12px] text-muted-foreground">
        This email is empty. Add a block to begin — Joon adds nothing on its own.
      </p>
    );
  }

  return (
    <>
      <ul role="listbox" aria-label="Blocks in this email" className="p-2">
        {blocks.map((block, index) => {
          const active = selectedId === block.id;
          const title = blockTitle(block);
          return (
            <li
              key={block.id}
              ref={(node) => {
                if (node) rowRefs.current.set(block.id, node);
                else rowRefs.current.delete(block.id);
              }}
              role="option"
              aria-selected={active}
              tabIndex={0}
              onClick={() => onSelect(block.id)}
              onKeyDown={(event) => onKeyDown(event, block, index)}
              className={cn(
                "group mb-1 flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 outline-none",
                "focus-visible:ring-2 focus-visible:ring-[#2D4F9E] focus-visible:ring-offset-1",
                active
                  ? "border-[#2D4F9E] bg-[#E9EFFF]"
                  : "border-transparent hover:border-border hover:bg-[#FFFDF8]",
              )}
            >
              <span className="w-7 text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{title}</p>
                <p className="text-[11px] capitalize text-muted-foreground">
                  {block.type.replace(/_/g, " ")}
                  {active ? <span className="sr-only"> — selected</span> : null}
                </p>
              </div>
              {/*
                Visible on hover, and on keyboard focus anywhere inside the row.
                `group-focus-within` is what makes these reachable at all without
                a mouse.
              */}
              <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <RowButton
                  label={`Move ${title} up`}
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(block.id, -1);
                    focusRow(block.id);
                  }}
                >
                  <ArrowUp className="h-3 w-3" />
                </RowButton>
                <RowButton
                  label={`Move ${title} down`}
                  disabled={index === blocks.length - 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(block.id, 1);
                    focusRow(block.id);
                  }}
                >
                  <ArrowDown className="h-3 w-3" />
                </RowButton>
                <RowButton
                  label={`Delete ${title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(block.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </RowButton>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="px-3 pb-3 text-[11px] text-muted-foreground">
        Arrow keys move between blocks. Alt and an arrow key moves the block itself.
      </p>
    </>
  );
}

function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: (event: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md p-1 text-muted-foreground outline-none hover:bg-[#ECE9E1] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#2D4F9E] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
