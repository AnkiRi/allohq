"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FileText, Plus, Copy, Trash2, Sparkles, Loader2, Eye, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

function getHeaderGradient(name: string): string {
  if (/welcome/i.test(name)) return "bg-gradient-to-r from-olive/20 to-olive/5";
  if (/win[- ]?back/i.test(name)) return "bg-gradient-to-r from-terracotta/20 to-terracotta/5";
  if (/post[- ]?purchase|follow[- ]?up/i.test(name)) return "bg-gradient-to-r from-warm-gold/20 to-warm-gold/5";
  if (/cart|abandoned/i.test(name)) return "bg-gradient-to-r from-red-100 to-red-50";
  return "bg-gradient-to-r from-white/30 to-white/10";
}

function getCategoryBadgeStyle(category: string): string {
  switch (category) {
    case "marketing":
      return "bg-olive/10 text-olive border border-olive/20";
    case "transactional":
      return "bg-terracotta/10 text-terracotta border border-terracotta/20";
    case "automation":
      return "bg-warm-gold/10 text-warm-gold border border-warm-gold/20";
    case "ai_generated":
      return "bg-purple-100 text-purple-700 border border-purple-200";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

function formatCategoryLabel(category: string): string {
  return category.replace(/_/g, " ").toUpperCase();
}

export default function TemplatesPage() {
  const { toast } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const { data: templates, isLoading } = trpc.templates.list.useQuery(
    categoryFilter ? { category: categoryFilter as any } : undefined
  ) as { data: { id: string; name: string; subject: string; category: string }[] | undefined; isLoading: boolean };
  const utils = trpc.useUtils();
  const duplicateMut = trpc.templates.duplicate.useMutation({
    onSuccess: () => { utils.templates.list.invalidate(); toast("Template duplicated", "success"); },
    onError: () => toast("Failed to duplicate", "error"),
  });
  const deleteMut = trpc.templates.delete.useMutation({
    onSuccess: () => { utils.templates.list.invalidate(); toast("Template deleted", "success"); },
    onError: () => toast("Failed to delete", "error"),
  });

  const categories = [
    { value: undefined, label: "All" },
    { value: "marketing", label: "Marketing" },
    { value: "transactional", label: "Transactional" },
    { value: "automation", label: "Automation" },
    { value: "ai_generated", label: "AI Generated" },
  ];

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    if (!templates || templates.length === 0) return [];
    const groups: Record<string, typeof templates> = {};
    for (const template of templates) {
      const cat = template.category || "uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(template);
    }
    return Object.entries(groups).map(([category, items]) => ({
      category,
      label: formatCategoryLabel(category),
      templates: items,
    }));
  }, [templates]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
            TEMPLATES
          </h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            Email templates for campaigns and automations
          </p>
        </div>
        <Link
          href="/templates/new"
          className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Template
        </Link>
      </div>

      {/* Category filters */}
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat.label}
            onClick={() => setCategoryFilter(cat.value)}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-all ${
              categoryFilter === cat.value
                ? "bg-secondary text-secondary-foreground"
                : "bg-white/20 border border-white/20 text-muted-foreground hover:bg-white/30"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-10"
        >
          {groupedTemplates.map((group) => (
            <motion.div key={group.category} variants={itemVariants}>
              {/* Group header */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-[13px] font-bold text-foreground/70 font-mono tracking-wide">
                  {group.label}
                </h2>
                <span className="text-[11px] text-muted-foreground/60 font-mono">
                  ({group.templates.length} {group.templates.length === 1 ? "template" : "templates"})
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              {/* Cards grid */}
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 gap-5"
              >
                {group.templates.map((template) => (
                  <motion.div
                    key={template.id}
                    variants={itemVariants}
                    className="glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all group"
                  >
                    {/* Color-coded header strip */}
                    <div className={`h-24 ${getHeaderGradient(template.name)} flex items-center justify-center`}>
                      <FileText className="w-7 h-7 text-foreground/20" />
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Title - full name, up to 2 lines */}
                      <h3 className="text-[13px] font-bold text-foreground font-mono leading-snug line-clamp-2">
                        {template.name}
                      </h3>

                      {/* Subject line */}
                      <p className="text-[11px] text-muted-foreground font-mono leading-relaxed line-clamp-1">
                        {template.subject}
                      </p>

                      {/* Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {template.category === "ai_generated" && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-purple-100 text-purple-700 border border-purple-200 rounded-md">
                            <Sparkles className="w-2.5 h-2.5" />
                            AI
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-[10px] font-mono rounded-md ${getCategoryBadgeStyle(template.category)}`}>
                          {formatCategoryLabel(template.category)}
                        </span>
                      </div>

                      {/* Actions row */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/40">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/templates/${template.id}/edit`}
                            className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </Link>
                          <Link
                            href={`/templates/${template.id}/edit`}
                            className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            Preview
                          </Link>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => duplicateMut.mutate({ id: template.id })}
                            disabled={duplicateMut.isPending}
                            className="p-1.5 rounded-lg hover:bg-white/20 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                          >
                            {duplicateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => deleteMut.mutate({ id: template.id })}
                            disabled={deleteMut.isPending}
                            className="p-1.5 rounded-lg hover:bg-white/20 text-muted-foreground hover:text-red-600 disabled:opacity-50 transition-colors"
                          >
                            {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="glass-card-static text-center py-20 rounded-xl">
          <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-[14px] text-foreground font-mono font-bold mb-1">No templates yet</p>
          <p className="text-[12px] text-muted-foreground font-sans mb-6">
            Create your first email template to get started with campaigns and automations.
          </p>
          <Link
            href="/templates/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-mono hover:bg-secondary/90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Template
          </Link>
        </div>
      )}
    </div>
  );
}
