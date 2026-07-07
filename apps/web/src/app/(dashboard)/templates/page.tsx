"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FileText, Plus, Copy, Trash2, Sparkles, Loader2, Eye, Pencil, Search, ChevronDown, AlertTriangle, CheckSquare, Square, MessageSquare } from "lucide-react";
import { templateDisplayName, templatePurpose, distinctPurposes } from "@/lib/templateName";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { SmartEmptyState } from "@/components/ui/SmartEmptyState";
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
  const [purposeFilter, setPurposeFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRemoveMenu, setShowRemoveMenu] = useState(false);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  const { data: templates, isLoading } = trpc.templates.list.useQuery(
    categoryFilter ? { category: categoryFilter as any } : undefined
  ) as { data: { id: string; name: string; subject: string; category: string }[] | undefined; isLoading: boolean };
  const utils = trpc.useUtils();

  const duplicateMut = trpc.templates.duplicate.useMutation({
    onSuccess: () => { utils.templates.list.invalidate(); toast("Copied. Here's your duplicate.", "success"); },
    onError: () => toast("We couldn't duplicate that. Mind trying again?", "error"),
  });
  const deleteMut = trpc.templates.delete.useMutation({
    onSuccess: () => { utils.templates.list.invalidate(); toast("Template deleted.", "success"); },
    onError: () => toast("We couldn't delete that. Mind trying again?", "error"),
  });
  const bulkDeleteMut = (trpc as any).templates.bulkDelete.useMutation({
    onSuccess: (result: { deleted: number }) => {
      utils.templates.list.invalidate();
      toast(`${result.deleted} templates deleted.`, "success");
      setSelectedIds(new Set());
    },
    onError: () => toast("We couldn't delete those. Mind trying again?", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };
  const deleteByCategoryMut = (trpc as any).templates.deleteByCategory.useMutation({
    onSuccess: (result: { deleted: number }) => {
      utils.templates.list.invalidate();
      toast(`${result.deleted} templates removed.`, "success");
      setShowRemoveMenu(false);
      setConfirmRemoveAll(false);
    },
    onError: () => toast("We couldn't remove those. Mind trying again?", "error"),
  }) as { mutate: (input: Record<string, unknown>) => void; isPending: boolean };

  const categories = [
    { value: undefined, label: "All" },
    { value: "marketing", label: "Marketing" },
    { value: "transactional", label: "Transactional" },
    { value: "automation", label: "Automation" },
    { value: "ai_generated", label: "AI Generated" },
  ];

  // Filter by search query
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((t) => {
      if (purposeFilter && templatePurpose(t.name) !== purposeFilter) return false;
      if (!q) return true;
      return (
        templateDisplayName(t.name).toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q)
      );
    });
  }, [templates, searchQuery, purposeFilter]);

  // Detect duplicates (same subject)
  const duplicateSubjects = useMemo(() => {
    if (!filteredTemplates.length) return new Set<string>();
    const counts: Record<string, number> = {};
    for (const t of filteredTemplates) {
      counts[t.subject] = (counts[t.subject] || 0) + 1;
    }
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([s]) => s));
  }, [filteredTemplates]);

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!templates) return {};
    const counts: Record<string, number> = {};
    for (const t of templates) {
      counts[t.category] = (counts[t.category] || 0) + 1;
    }
    return counts;
  }, [templates]);

  // Group templates by category
  const groupedTemplates = useMemo(() => {
    if (!filteredTemplates.length) return [];
    const groups: Record<string, typeof filteredTemplates> = {};
    for (const template of filteredTemplates) {
      const cat = template.category || "uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(template);
    }
    return Object.entries(groups).map(([category, items]) => ({
      category,
      label: formatCategoryLabel(category),
      templates: items,
    }));
  }, [filteredTemplates]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredTemplates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTemplates.map((t) => t.id)));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-header accent-bar-left text-[22px] tracking-[-0.5px] font-semibold text-foreground font-serif">
            Templates
          </h1>
          <p className="text-[13px] text-muted-foreground font-sans mt-1">
            Your saved, reusable emails — pick any one into a campaign or automation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Channel templates link */}
          <Link
            href="/templates/channel"
            className="flex items-center gap-2 px-3 py-2 border border-border text-muted-foreground rounded-lg text-xs font-sans hover:bg-muted/50 transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            SMS / WhatsApp / RCS
          </Link>
          {/* Remove menu */}
          <div className="relative">
            <button
              onClick={() => setShowRemoveMenu(!showRemoveMenu)}
              className="flex items-center gap-1.5 px-3 py-2 border border-border text-muted-foreground rounded-lg text-xs font-sans hover:bg-muted/50 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
              <ChevronDown className="w-3 h-3" />
            </button>
            {showRemoveMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-border rounded-lg shadow-lg z-10 py-1">
                <button
                  onClick={() => {
                    deleteByCategoryMut.mutate({ category: "ai_generated" });
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 transition-colors text-foreground"
                >
                  Remove All AI Generated ({categoryCounts.ai_generated || 0})
                </button>
                <div className="h-px bg-border mx-2" />
                {!confirmRemoveAll ? (
                  <button
                    onClick={() => setConfirmRemoveAll(true)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 transition-colors text-red-600"
                  >
                    Remove All Templates ({templates?.length || 0})
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      deleteByCategoryMut.mutate({});
                    }}
                    className="w-full text-left px-3 py-2 text-xs bg-red-50 text-red-700 font-medium"
                  >
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Yes, delete all {templates?.length || 0}. This can't be undone
                  </button>
                )}
              </div>
            )}
          </div>
          <Link
            href="/templates/new"
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-xs font-sans hover:bg-secondary/90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search templates by name or subject..."
          className="w-full pl-10 pr-4 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/30 transition-colors"
        />
      </div>

      {/* Purpose filter — find by what the email is FOR, not its machine name */}
      {templates && templates.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setPurposeFilter(undefined)}
            className={`px-2.5 py-1 text-[11px] font-sans rounded-full transition-all ${
              !purposeFilter
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All purposes
          </button>
          {distinctPurposes(templates.map((t) => t.name)).map((p) => (
            <button
              key={p}
              onClick={() => setPurposeFilter(p === purposeFilter ? undefined : p)}
              className={`px-2.5 py-1 text-[11px] font-sans rounded-full transition-all ${
                purposeFilter === p
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Category filters with counts */}
      <div className="flex items-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat.label}
            onClick={() => setCategoryFilter(cat.value)}
            className={`px-3 py-1.5 text-xs font-sans rounded-lg transition-all ${
              categoryFilter === cat.value
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {cat.label}
            {cat.value && categoryCounts[cat.value] ? ` (${categoryCounts[cat.value]})` : ""}
            {!cat.value && templates ? ` (${templates.length})` : ""}
          </button>
        ))}

        {/* Bulk selection controls */}
        {filteredTemplates.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={selectAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {selectedIds.size === filteredTemplates.length ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={() => bulkDeleteMut.mutate({ ids: Array.from(selectedIds) })}
                disabled={bulkDeleteMut.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                Delete Selected ({selectedIds.size})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-52 glass-skeleton rounded-xl" />
          ))}
        </div>
      ) : filteredTemplates.length > 0 ? (
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
                <h2 className="text-[13px] font-bold text-foreground/70 font-serif tracking-wide">
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
                className="grid grid-cols-1 sm:grid-cols-2 gap-5"
              >
                {group.templates.map((template) => {
                  const isDuplicate = duplicateSubjects.has(template.subject);
                  const isSelected = selectedIds.has(template.id);

                  return (
                    <motion.div
                      key={template.id}
                      variants={itemVariants}
                      className={`glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all group relative ${
                        isSelected ? "ring-2 ring-foreground/20" : ""
                      }`}
                    >
                      {/* Selection checkbox */}
                      <button
                        onClick={() => toggleSelect(template.id)}
                        className="absolute top-3 left-3 z-10 w-5 h-5 rounded flex items-center justify-center bg-card border border-border hover:bg-white transition-colors"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-foreground" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </button>

                      {/* Color-coded header strip */}
                      <div className={`h-24 ${getHeaderGradient(template.name)} flex items-center justify-center`}>
                        <FileText className="w-7 h-7 text-foreground/20" />
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Title */}
                        <h3 className="text-[13px] font-bold text-foreground font-serif leading-snug line-clamp-2">
                          {templateDisplayName(template.name)}
                        </h3>

                        {/* Subject line */}
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1">
                          {template.subject}
                        </p>

                        {/* Badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {template.category === "ai_generated" && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-sans bg-purple-100 text-purple-700 border border-purple-200 rounded-md">
                              <Sparkles className="w-2.5 h-2.5" />
                              AI
                            </span>
                          )}
                          <span className={`px-2 py-0.5 text-[10px] font-sans rounded-md ${getCategoryBadgeStyle(template.category)}`}>
                            {formatCategoryLabel(template.category)}
                          </span>
                          {isDuplicate && (
                            <span className="px-1.5 py-0.5 text-[10px] font-sans bg-amber-100 text-amber-700 border border-amber-200 rounded-md">
                              Duplicate
                            </span>
                          )}
                        </div>

                        {/* Actions row */}
                        <div className="flex items-center justify-between pt-2 border-t border-border/40">
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/templates/${template.id}/edit`}
                              className="flex items-center gap-1 text-[11px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </Link>
                            <Link
                              href={`/templates/${template.id}/edit`}
                              className="flex items-center gap-1 text-[11px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              Preview
                            </Link>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => duplicateMut.mutate({ id: template.id })}
                              disabled={duplicateMut.isPending}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                            >
                              {duplicateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => deleteMut.mutate({ id: template.id })}
                              disabled={deleteMut.isPending}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-red-600 disabled:opacity-50 transition-colors"
                            >
                              {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          ))}
        </motion.div>
      ) : searchQuery ? (
        <div className="glass-card-static rounded-xl p-12 text-center">
          <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground">Nothing matched</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Nothing matches &ldquo;{searchQuery}&rdquo;. Try another search.
          </p>
        </div>
      ) : (
        <SmartEmptyState
          icon={FileText}
          title="No templates yet"
          description="joon can write beautiful emails that sound just like your brand."
          actions={[
            { label: "Write a welcome email", primary: true },
            { label: "Write a win-back email" },
          ]}
        />
      )}
    </div>
  );
}
