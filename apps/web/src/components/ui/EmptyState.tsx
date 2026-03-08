"use client";

import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warm-cream-100 text-warm-cream-500">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-lg font-semibold text-warm-cream-900">{title}</h3>
      {description && (
        <p className="mb-4 max-w-md text-center text-sm text-warm-cream-600">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
