"use client";

import type { EmailBlock } from "@allohq/email-builder";

// ---------------------------------------------------------------------------
// Shared form primitives
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-sans font-semibold text-muted-foreground uppercase tracking-wider mb-1">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition"
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
      className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition"
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
      className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-mono text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-muted-foreground transition"
    />
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-border cursor-pointer p-0"
      />
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition"
      />
    </div>
  );
}

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
      className="w-full px-3 py-1.5 rounded-lg border border-border bg-card text-[13px] font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-muted-foreground transition"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
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
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-border text-foreground focus:ring-muted-foreground"
      />
      <span className="text-[13px] font-sans text-foreground">{label}</span>
    </label>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1">{children}</div>;
}

// ---------------------------------------------------------------------------
// Align options constant
// ---------------------------------------------------------------------------

const ALIGN_OPTIONS = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

// ---------------------------------------------------------------------------
// Per-block-type property forms
// ---------------------------------------------------------------------------

function TextProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "text" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <>
      <FieldGroup>
        <Label>HTML Content</Label>
        <TextArea value={block.props.html} onChange={(html) => set({ html })} rows={6} />
      </FieldGroup>
      <FieldGroup>
        <Label>Align</Label>
        <SelectInput value={block.props.align} onChange={(align) => set({ align: align as "left" | "center" | "right" })} options={ALIGN_OPTIONS} />
      </FieldGroup>
      <FieldGroup>
        <Label>Font Size</Label>
        <NumberInput value={block.props.fontSize} onChange={(fontSize) => set({ fontSize })} min={8} max={72} />
      </FieldGroup>
      <FieldGroup>
        <Label>Color</Label>
        <ColorInput value={block.props.color} onChange={(color) => set({ color })} />
      </FieldGroup>
    </>
  );
}

function ImageProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "image" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <>
      <FieldGroup>
        <Label>Image URL</Label>
        <TextInput value={block.props.src} onChange={(src) => set({ src })} placeholder="https://..." />
      </FieldGroup>
      <FieldGroup>
        <Label>Alt Text</Label>
        <TextInput value={block.props.alt || ""} onChange={(alt) => set({ alt })} placeholder="Describe the image" />
      </FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        <FieldGroup>
          <Label>Width</Label>
          <NumberInput value={block.props.width} onChange={(width) => set({ width })} min={0} />
        </FieldGroup>
        <FieldGroup>
          <Label>Height</Label>
          <NumberInput value={block.props.height} onChange={(height) => set({ height })} min={0} />
        </FieldGroup>
      </div>
      <FieldGroup>
        <Label>Link URL</Label>
        <TextInput value={block.props.href || ""} onChange={(href) => set({ href })} placeholder="https://..." />
      </FieldGroup>
      <FieldGroup>
        <Label>Align</Label>
        <SelectInput value={block.props.align} onChange={(align) => set({ align: align as "left" | "center" | "right" })} options={ALIGN_OPTIONS} />
      </FieldGroup>
    </>
  );
}

function ButtonProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "button" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <>
      <FieldGroup>
        <Label>Button Text</Label>
        <TextInput value={block.props.text} onChange={(text) => set({ text })} />
      </FieldGroup>
      <FieldGroup>
        <Label>Link URL</Label>
        <TextInput value={block.props.href} onChange={(href) => set({ href })} placeholder="https://..." />
      </FieldGroup>
      <FieldGroup>
        <Label>Background Color</Label>
        <ColorInput value={block.props.bgColor} onChange={(bgColor) => set({ bgColor })} />
      </FieldGroup>
      <FieldGroup>
        <Label>Text Color</Label>
        <ColorInput value={block.props.textColor} onChange={(textColor) => set({ textColor })} />
      </FieldGroup>
      <FieldGroup>
        <Label>Border Radius</Label>
        <NumberInput value={block.props.borderRadius} onChange={(borderRadius) => set({ borderRadius })} min={0} max={50} />
      </FieldGroup>
      <FieldGroup>
        <Label>Align</Label>
        <SelectInput value={block.props.align} onChange={(align) => set({ align: align as "left" | "center" | "right" })} options={ALIGN_OPTIONS} />
      </FieldGroup>
      <Checkbox
        checked={block.props.fullWidth ?? false}
        onChange={(fullWidth) => set({ fullWidth })}
        label="Full Width"
      />
    </>
  );
}

function DividerProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "divider" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <>
      <FieldGroup>
        <Label>Color</Label>
        <ColorInput value={block.props.color} onChange={(color) => set({ color })} />
      </FieldGroup>
      <FieldGroup>
        <Label>Thickness (px)</Label>
        <NumberInput value={block.props.thickness} onChange={(thickness) => set({ thickness })} min={1} max={20} />
      </FieldGroup>
      <FieldGroup>
        <Label>Margin (px)</Label>
        <NumberInput value={block.props.margin} onChange={(margin) => set({ margin })} min={0} max={100} />
      </FieldGroup>
    </>
  );
}

function SpacerProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "spacer" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <FieldGroup>
      <Label>Height (px)</Label>
      <NumberInput value={block.props.height} onChange={(height) => set({ height })} min={1} max={200} />
    </FieldGroup>
  );
}

function ProductProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "product" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <>
      <FieldGroup>
        <Label>Product ID</Label>
        <p className="px-3 py-1.5 rounded-lg border border-border bg-muted text-[13px] font-mono text-muted-foreground truncate">
          {block.props.productId || "No product selected"}
        </p>
      </FieldGroup>
      <Checkbox
        checked={block.props.showPrice ?? true}
        onChange={(showPrice) => set({ showPrice })}
        label="Show Price"
      />
      <Checkbox
        checked={block.props.showDescription ?? true}
        onChange={(showDescription) => set({ showDescription })}
        label="Show Description"
      />
      <Checkbox
        checked={block.props.showImage ?? true}
        onChange={(showImage) => set({ showImage })}
        label="Show Image"
      />
      <FieldGroup>
        <Label>Button Text</Label>
        <TextInput value={block.props.buttonText || ""} onChange={(buttonText) => set({ buttonText })} placeholder="Shop Now" />
      </FieldGroup>
    </>
  );
}

function HeaderProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "header" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <>
      <FieldGroup>
        <Label>Logo URL</Label>
        <TextInput value={block.props.logoSrc || ""} onChange={(logoSrc) => set({ logoSrc })} placeholder="https://..." />
      </FieldGroup>
      <FieldGroup>
        <Label>Background Color</Label>
        <ColorInput value={block.props.bgColor} onChange={(bgColor) => set({ bgColor })} />
      </FieldGroup>
    </>
  );
}

function FooterProps({
  block,
  onUpdate,
}: {
  block: Extract<EmailBlock, { type: "footer" }>;
  onUpdate: (b: EmailBlock) => void;
}) {
  const set = (patch: Partial<typeof block.props>) =>
    onUpdate({ ...block, props: { ...block.props, ...patch } });

  return (
    <>
      <FieldGroup>
        <Label>Footer Text</Label>
        <TextArea value={block.props.text} onChange={(text) => set({ text })} rows={3} />
      </FieldGroup>
      <FieldGroup>
        <Label>Unsubscribe Text</Label>
        <TextInput value={block.props.unsubscribeText || ""} onChange={(unsubscribeText) => set({ unsubscribeText })} />
      </FieldGroup>
    </>
  );
}

// ---------------------------------------------------------------------------
// PropertyPanel
// ---------------------------------------------------------------------------

interface PropertyPanelProps {
  selectedBlock: EmailBlock | null;
  onUpdate: (block: EmailBlock) => void;
}

export function PropertyPanel({ selectedBlock, onUpdate }: PropertyPanelProps) {
  if (!selectedBlock) {
    return (
      <aside className="w-72 bg-card border-l border-border flex flex-col items-center justify-center">
        <p className="text-[13px] font-sans text-muted-foreground">Select a block to edit</p>
      </aside>
    );
  }

  const renderFields = () => {
    switch (selectedBlock.type) {
      case "text":
        return <TextProps block={selectedBlock} onUpdate={onUpdate} />;
      case "image":
        return <ImageProps block={selectedBlock} onUpdate={onUpdate} />;
      case "button":
        return <ButtonProps block={selectedBlock} onUpdate={onUpdate} />;
      case "divider":
        return <DividerProps block={selectedBlock} onUpdate={onUpdate} />;
      case "spacer":
        return <SpacerProps block={selectedBlock} onUpdate={onUpdate} />;
      case "product":
        return <ProductProps block={selectedBlock} onUpdate={onUpdate} />;
      case "header":
        return <HeaderProps block={selectedBlock} onUpdate={onUpdate} />;
      case "footer":
        return <FooterProps block={selectedBlock} onUpdate={onUpdate} />;
      default:
        return (
          <p className="text-[13px] font-sans text-muted-foreground">
            No properties for this block type.
          </p>
        );
    }
  };

  return (
    <aside className="w-72 bg-card border-l border-border flex flex-col overflow-y-auto">
      <div className="px-4 py-4 border-b border-border">
        <h2 className="text-[10px] font-bold text-foreground font-serif tracking-[1px] uppercase">
          {selectedBlock.type} Properties
        </h2>
      </div>
      <div className="p-4 space-y-4">{renderFields()}</div>
    </aside>
  );
}
