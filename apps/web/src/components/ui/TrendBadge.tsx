"use client";

import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export function TrendBadge({
  value,
  up,
  className = "",
}: {
  value: string;
  up: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full ${
        up
          ? "bg-[#1F7A4F]/10 text-[#1F7A4F]"
          : "bg-[#1F7A4F]/10 text-[#1F7A4F]"
      } ${className}`}
    >
      {up ? (
        <ArrowUpRight className="w-3 h-3" />
      ) : (
        <ArrowDownRight className="w-3 h-3" />
      )}
      {value}
    </span>
  );
}
