"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Plus, Copy, Trash2, Sparkles, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">TEMPLATES</h1>
          <p className="text-sm text-gray-400 font-mono mt-1">Email templates for campaigns and automations</p>
        </div>
        <Link
          href="/templates/new"
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-mono hover:bg-gray-800 transition-all"
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
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="border border-gray-200 rounded-xl bg-white overflow-hidden hover:border-gray-900 hover:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all group"
            >
              <div className="h-32 bg-gray-50 flex items-center justify-center border-b border-gray-100">
                <FileText className="w-8 h-8 text-gray-300" />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  {template.category === "ai_generated" && <Sparkles className="w-3 h-3 text-gray-400" />}
                  <h3 className="text-sm font-bold text-gray-900 font-mono truncate">{template.name}</h3>
                </div>
                <p className="text-xs text-gray-400 font-mono truncate">{template.subject}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-gray-300 font-mono uppercase">{template.category}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/templates/${template.id}/edit`}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => duplicateMut.mutate({ id: template.id })}
                      disabled={duplicateMut.isPending}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-900 disabled:opacity-50 transition-colors"
                    >
                      {duplicateMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteMut.mutate({ id: template.id })}
                      disabled={deleteMut.isPending}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                    >
                      {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border border-gray-200 rounded-xl bg-white">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-mono">No templates yet</p>
          <p className="text-xs text-gray-300 font-mono mt-1">Create your first email template</p>
        </div>
      )}
    </div>
  );
}
