"use client";

import { type LucideIcon, Sparkles } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

interface SmartEmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
}

interface SmartEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actions?: SmartEmptyStateAction[];
}

export function SmartEmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  actions = [],
}: SmartEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent)]/10 flex items-center justify-center mb-5">
        <Icon className="w-7 h-7 text-[var(--color-accent)]" />
      </div>
      <h3 className="text-[16px] font-serif font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-[13px] text-muted-foreground font-sans max-w-md leading-relaxed mb-6">
        {description}
      </p>
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actions.map((action) =>
            action.href ? (
              <Link
                key={action.label}
                href={action.href}
                className={
                  action.primary
                    ? "px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-[13px] font-sans font-medium hover:opacity-90 transition-opacity"
                    : "px-5 py-2.5 rounded-xl border border-border text-[13px] font-sans text-foreground hover:bg-muted transition-colors"
                }
              >
                {action.label}
              </Link>
            ) : (
              <button
                key={action.label}
                onClick={action.onClick}
                className={
                  action.primary
                    ? "px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-[13px] font-sans font-medium hover:opacity-90 transition-opacity"
                    : "px-5 py-2.5 rounded-xl border border-border text-[13px] font-sans text-foreground hover:bg-muted transition-colors"
                }
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      )}
    </motion.div>
  );
}
