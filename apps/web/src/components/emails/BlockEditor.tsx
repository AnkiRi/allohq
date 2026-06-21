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
  "w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition";

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
        className="w-4 h-4 rounded border-border accent-[var(--color-accent)]"
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

function ImageEditor({ block, onUpdate }: { block: Extract<EmailBlock, { type: "image" }>; onUpdate: (b: EmailBlock) => void }) {
  const set = useSet(block, onUpdate);
  return (
    <>
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
  return (
    <>
      <Field><Label>Title</Label><TextInput value={block.props.title ?? ""} onChange={(title) => set({ title })} /></Field>
      <Field><Label>Description</Label><TextArea value={block.props.description ?? ""} onChange={(description) => set({ description })} rows={2} /></Field>
      <Field><Label>Image URL</Label><TextInput value={block.props.imageUrl ?? ""} onChange={(imageUrl) => set({ imageUrl })} mono placeholder="https://…" /></Field>
      <Field><Label>Price (₹)</Label><NumberInput value={block.props.price} onChange={(price) => set({ price })} min={0} /></Field>
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
              className="text-[11px] font-mono text-muted-foreground hover:text-red-500"
            >
              remove item
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setItems([...items, { icon: "🌿", label: "New", description: "" }])}
        className="text-[12px] font-mono text-[var(--color-accent)] hover:underline"
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
}: {
  block: EmailBlock | null;
  onUpdate: (b: EmailBlock) => void;
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
      case "image": return <ImageEditor block={block} onUpdate={onUpdate} />;
      case "button": return <ButtonEditor block={block} onUpdate={onUpdate} />;
      case "product": return <ProductEditor block={block} onUpdate={onUpdate} />;
      case "testimonial": return <TestimonialEditor block={block} onUpdate={onUpdate} />;
      case "icon_row": return <IconRowEditor block={block} onUpdate={onUpdate} />;
      case "spacer": return <SpacerEditor block={block} onUpdate={onUpdate} />;
      default:
        return (
          <p className="text-[13px] font-sans text-muted-foreground">
            This block has no inline properties — reorder or delete it from the list.
          </p>
        );
    }
  })();

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--color-accent)]">
          {block.type} · {block.id}
        </h3>
      </div>
      <div className="p-4 space-y-3.5">{body}</div>
    </div>
  );
}
