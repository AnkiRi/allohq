"use client";

import * as React from "react";
import type { EmailBlock } from "@allohq/email-builder";

// ---------------------------------------------------------------------------
// Terminal/emerald form primitives (mono for data/tags, sans for labels).
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-sans font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-1">
      {children}
    </label>
  );
}

const inputCls =
  "w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-decision transition";

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputCls} ${mono ? "font-mono" : "font-sans"}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={`${inputCls} font-sans resize-y leading-relaxed`}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      className={`${inputCls} font-mono`}
    />
  );
}

const ALIGN_OPTIONS = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={value || options[0]?.value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} font-sans`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-border accent-decision"
      />
      <span className="text-[13px] font-sans text-foreground">{label}</span>
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1">{children}</div>;
}

// ---------------------------------------------------------------------------
// Per-type editors. NOTE: colors/sizing here are deliberate, brand-safe knobs;
// brand palette is supplied by the BrandKit at render time, so we expose the
// content-level pixel controls (copy, image, alignment, spacing, CTA, order).
// ---------------------------------------------------------------------------

type Setter = (patch: Record<string, unknown>) => void;

function useSet(block: EmailBlock, onUpdate: (b: EmailBlock) => void): Setter {
  return (patch) =>
    onUpdate({ ...block, props: { ...(block.props as object), ...patch } } as EmailBlock);
}

function HeroEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "hero" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return (
    <>
      <Field><Label>Heading</Label><TextArea value={block.props.heading} onChange={(heading) => set({ heading })} rows={2} /></Field>
      <Field><Label>Subtext</Label><TextArea value={block.props.subtext ?? ""} onChange={(subtext) => set({ subtext })} rows={3} /></Field>
      <Field><Label>Button text</Label><TextInput value={block.props.buttonText ?? ""} onChange={(buttonText) => set({ buttonText })} placeholder="optional" /></Field>
      <Field><Label>Button link</Label><TextInput value={block.props.buttonHref ?? ""} onChange={(buttonHref) => set({ buttonHref })} mono placeholder="https://…" /></Field>
      <Field><Label>Background image URL</Label><TextInput value={block.props.bgImageSrc ?? ""} onChange={(bgImageSrc) => set({ bgImageSrc })} mono placeholder="optional" /></Field>
      <Field><Label>Align</Label><SelectInput value={block.props.align} onChange={(align) => set({ align })} options={ALIGN_OPTIONS} /></Field>
    </>
  );
}

function TextEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "text" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return (
    <>
      <Field>
        <Label>Copy (blank line = new paragraph · {"{{merge_tags}}"} supported)</Label>
        <TextArea value={block.props.html} onChange={(html) => set({ html })} rows={7} />
      </Field>
      <Field><Label>Align</Label><SelectInput value={block.props.align} onChange={(align) => set({ align })} options={ALIGN_OPTIONS} /></Field>
      <Field><Label>Font size (px)</Label><NumberInput value={block.props.fontSize} onChange={(fontSize) => set({ fontSize })} min={10} max={40} /></Field>
    </>
  );
}

function ImageEditor({ block, onUpdate, onOpenVisuals, onUploadImage, onChooseAsset }: { block: Extract<EmailBlock, { type: "image" }>; onUpdate: (b: EmailBlock) => void; onOpenVisuals?: () => void; onUploadImage?: () => void; onChooseAsset?: () => void }) {
  const set = useSet(block, onUpdate);
  const empty = !block.props.src?.trim();
  return (
    <>
      {/*
        An empty image block used to offer only a URL field, so the only way to
        fill it was to already have a hosted image somewhere else. The way to
        get a picture is now the first thing in the block.
      */}
      {empty ? (
        <div className="mb-3 rounded-lg border border-dashed border-border bg-card p-3">
          <p className="text-[13px] font-sans text-foreground">This image is empty</p>
          <p className="mt-1 text-[11px] font-sans text-muted-foreground">
            Three ways to fill it. Pasting a link is the fourth, below.
          </p>
          <div className="mt-2.5 grid gap-1.5">
            <button
              type="button"
              onClick={onOpenVisuals}
              className="rounded-lg bg-[#17204D] px-3 py-2 text-left text-[12px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
            >
              Generate a visual
            </button>
            <button
              type="button"
              onClick={onUploadImage}
              className="rounded-lg border border-border px-3 py-2 text-left text-[12px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
            >
              Upload an image
            </button>
            <button
              type="button"
              onClick={onChooseAsset}
              className="rounded-lg border border-border px-3 py-2 text-left text-[12px] outline-none hover:bg-[#F4F2EC] focus-visible:ring-2 focus-visible:ring-[#2D4F9E]"
            >
              Choose from library
            </button>
          </div>
        </div>
      ) : null}
      <Field><Label>Image URL</Label><TextInput value={block.props.src} onChange={(src) => set({ src })} mono placeholder="https://…" /></Field>
      <Field><Label>Alt text</Label><TextInput value={block.props.alt ?? ""} onChange={(alt) => set({ alt })} placeholder="Describe the image" /></Field>
      <Field><Label>Width (px)</Label><NumberInput value={block.props.width} onChange={(width) => set({ width })} min={0} /></Field>
      <Field><Label>Link URL</Label><TextInput value={block.props.href ?? ""} onChange={(href) => set({ href })} mono placeholder="optional" /></Field>
      <Field><Label>Align</Label><SelectInput value={block.props.align} onChange={(align) => set({ align })} options={ALIGN_OPTIONS} /></Field>
    </>
  );
}

function ButtonEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "button" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return (
    <>
      <Field><Label>Button text</Label><TextInput value={block.props.text} onChange={(text) => set({ text })} /></Field>
      <Field><Label>Link URL</Label><TextInput value={block.props.href} onChange={(href) => set({ href })} mono placeholder="https://…" /></Field>
      <Field><Label>Align</Label><SelectInput value={block.props.align} onChange={(align) => set({ align })} options={ALIGN_OPTIONS} /></Field>
    </>
  );
}

function ProductEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "product" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  const bound = Boolean(block.props.productId);
  return (
    <>
      {/*
        When a product is bound, the renderer resolves title, description, image
        and price from the store and IGNORES whatever is on the block. Leaving
        these as text inputs invited a merchant to type a price that would never
        be sent — so they read as facts, and the Shopify tab is where the product
        is changed.
      */}
      {bound ? (
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <p className="text-[10px] font-sans font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            From your store
          </p>
          <p className="mt-1 text-[13px] font-sans text-foreground">{block.props.title || "Untitled product"}</p>
          {block.props.price !== undefined ? (
            <p className="text-[12px] font-mono text-muted-foreground">{block.props.price}</p>
          ) : null}
          <p className="mt-2 text-[11px] font-sans text-muted-foreground">
            Shopify supplies these at send time. Change the product in the Shopify tab.
          </p>
        </div>
      ) : (
        <>
          <Field><Label>Title</Label><TextInput value={block.props.title ?? ""} onChange={(title) => set({ title })} /></Field>
          <Field><Label>Description</Label><TextArea value={block.props.description ?? ""} onChange={(description) => set({ description })} rows={2} /></Field>
          <Field><Label>Image URL</Label><TextInput value={block.props.imageUrl ?? ""} onChange={(imageUrl) => set({ imageUrl })} mono placeholder="https://…" /></Field>
          <Field><Label>Price (store currency)</Label><NumberInput value={block.props.price} onChange={(price) => set({ price })} min={0} /></Field>
        </>
      )}
      <Field><Label>Button text</Label><TextInput value={block.props.buttonText ?? ""} onChange={(buttonText) => set({ buttonText })} /></Field>
      <Field><Label>Button link</Label><TextInput value={block.props.buttonHref ?? ""} onChange={(buttonHref) => set({ buttonHref })} mono placeholder="https://…" /></Field>
      <div className="space-y-2 pt-1">
        <Checkbox checked={block.props.showImage ?? true} onChange={(showImage) => set({ showImage })} label="Show image" />
        <Checkbox checked={block.props.showPrice ?? true} onChange={(showPrice) => set({ showPrice })} label="Show price" />
        <Checkbox checked={block.props.showDescription ?? true} onChange={(showDescription) => set({ showDescription })} label="Show description" />
      </div>
    </>
  );
}

function ProductGridEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "product_grid" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return (
    <>
      <div className="mb-3 rounded-lg border border-border bg-card p-3">
        <p className="text-[13px] font-sans text-foreground">
          {block.props.productIds.length
            ? `${block.props.productIds.length} product${block.props.productIds.length === 1 ? "" : "s"} in this grid`
            : "No products chosen yet"}
        </p>
        <p className="mt-1 text-[11px] font-sans text-muted-foreground">
          Choose them in the Shopify tab — typing ids by hand is how a grid ends up
          pointing at something that is not in your store.
        </p>
      </div>
      <Field><Label>Columns</Label><SelectInput value={String(block.props.columns ?? 2)} onChange={(columns) => set({ columns: Number(columns) })} options={[{ label: "Two", value: "2" }, { label: "Three", value: "3" }]} /></Field>
      <div className="space-y-2 pt-1">
        <Checkbox checked={block.props.showPrice ?? true} onChange={(showPrice) => set({ showPrice })} label="Show price" />
        <Checkbox checked={block.props.showDescription ?? false} onChange={(showDescription) => set({ showDescription })} label="Show description" />
      </div>
    </>
  );
}

function CustomHtmlEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "custom_html" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return (
    <>
      <Field><Label>Label</Label><TextInput value={block.props.label ?? ""} onChange={(label) => set({ label })} placeholder="Custom section" /></Field>
      <Field><Label>Email-safe HTML</Label><TextArea value={block.props.html} onChange={(html) => set({ html })} rows={14} /></Field>
      <p className="text-[12px] leading-5 text-muted-foreground">Scripts, forms, frames and event handlers are removed before preview and delivery. Keep layout table-based for dependable inbox rendering.</p>
    </>
  );
}

function TestimonialEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "testimonial" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return (
    <>
      <Field><Label>Quote</Label><TextArea value={block.props.quote} onChange={(quote) => set({ quote })} rows={3} /></Field>
      <Field><Label>Author</Label><TextInput value={block.props.author} onChange={(author) => set({ author })} /></Field>
      <Field><Label>Rating (0–5)</Label><NumberInput value={block.props.rating} onChange={(rating) => set({ rating })} min={0} max={5} /></Field>
    </>
  );
}

function IconRowEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "icon_row" }>; onUpdate: (b: EmailBlock) => void }) {
  const items = block.props.items;
  const setItems = (next: typeof items) => onUpdate({ ...block, props: { ...block.props, items: next } });
  const update = (i: number, patch: Partial<(typeof items)[number]>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  return (
    <div className="space-y-4">
      {items.map((it, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-border p-2.5">
          <div className="grid grid-cols-[56px_1fr] gap-2">
            <Field><Label>Icon</Label><TextInput value={it.icon} onChange={(icon) => update(i, { icon })} /></Field>
            <Field><Label>Label</Label><TextInput value={it.label} onChange={(label) => update(i, { label })} /></Field>
          </div>
          <Field><Label>Description</Label><TextInput value={it.description ?? ""} onChange={(description) => update(i, { description })} /></Field>
          {items.length > 1 ? (
            <button
              type="button"
              onClick={() => setItems(items.filter((_, idx) => idx !== i))}
              className="text-[11px] font-mono text-muted-foreground hover:text-destructive"
            >
              remove item
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setItems([...items, { icon: "🌿", label: "New", description: "" }])}
        className="text-[12px] font-mono text-decision hover:underline"
      >
        + add item
      </button>
    </div>
  );
}

function SpacerEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "spacer" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return <Field><Label>Height (px)</Label><NumberInput value={block.props.height} onChange={(height) => set({ height })} min={1} max={160} /></Field>;
}

export function BlockEditor({
  block,
  onUpdate,
  onOpenVisuals,
  onUploadImage,
  onChooseAsset,
}: {
  block: EmailBlock | null;
  onUpdate: (b: EmailBlock) => void;
  /** Takes the merchant to the Visuals tab, where images are actually made. */
  onOpenVisuals?: () => void;
  onUploadImage?: () => void;
  onChooseAsset?: () => void;
}) {
  if (!block) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-[13px] font-sans text-muted-foreground max-w-[24ch]">
          Select a block on the left to edit it to the pixel.
        </p>
      </div>
    );
  }

  const body = (() => {
    switch (block.type) {
      case "hero": return <HeroEditor block={block} onUpdate={onUpdate} />;
      case "text": return <TextEditor block={block} onUpdate={onUpdate} />;
      case "image": return <ImageEditor block={block} onUpdate={onUpdate} onOpenVisuals={onOpenVisuals} onUploadImage={onUploadImage} onChooseAsset={onChooseAsset} />;
      case "button": return <ButtonEditor block={block} onUpdate={onUpdate} />;
      case "product": return <ProductEditor block={block} onUpdate={onUpdate} />;
      case "product_grid": return <ProductGridEditor block={block} onUpdate={onUpdate} />;
      case "testimonial": return <TestimonialEditor block={block} onUpdate={onUpdate} />;
      case "icon_row": return <IconRowEditor block={block} onUpdate={onUpdate} />;
      case "spacer": return <SpacerEditor block={block} onUpdate={onUpdate} />;
      case "custom_html": return <CustomHtmlEditor block={block} onUpdate={onUpdate} />;
      default:
        return (
          <p className="text-[13px] font-sans text-muted-foreground">
            This block has no inline properties. Reorder or delete it from the list.
          </p>
        );
    }
  })();

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.16em] text-decision">
          {block.type} · {block.id}
        </h3>
      </div>
      <div className="p-4 space-y-3.5">{body}</div>
    </div>
  );
}
