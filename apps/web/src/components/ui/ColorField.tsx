"use client";

// A premium color control: a soft rounded swatch (shows the colour, opens the
// native picker on click) paired with a mono hex input — replacing the raw
// `<input type="color">` black bar that read as harsh/unfinished.
export function ColorField({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label
        className="relative w-8 h-8 rounded-lg border border-border overflow-hidden shrink-0 cursor-pointer shadow-sm"
        style={{ backgroundColor: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          aria-label="Pick a colour"
        />
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="flex-1 min-w-0 px-2.5 py-1.5 bg-background border border-border rounded-md text-[12px] font-mono uppercase text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] transition-shadow"
      />
    </div>
  );
}
