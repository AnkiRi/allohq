"use client";

export function PulseDot({ color = "bg-primary", size = "md" }: { color?: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span className={`relative flex ${dim}`}>
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-40`}
      />
      <span className={`relative inline-flex rounded-full ${dim} ${color}`} />
    </span>
  );
}
