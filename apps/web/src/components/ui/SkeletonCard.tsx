"use client";

export function SkeletonCard({
  rows = 3,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-warm-cream-200 bg-white/60 p-6 ${className}`}
    >
      <div className="mb-4 h-4 w-1/3 rounded bg-warm-cream-200" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="mb-2 h-3 rounded bg-warm-cream-100"
          style={{ width: `${85 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = "",
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-warm-cream-200 bg-white/60 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex gap-4 border-b border-warm-cream-200 bg-warm-cream-50 px-6 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded bg-warm-cream-200" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-warm-cream-100 px-6 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-3 flex-1 rounded bg-warm-cream-100" />
          ))}
        </div>
      ))}
    </div>
  );
}
