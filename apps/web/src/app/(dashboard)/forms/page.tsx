"use client";

import Link from "next/link";
import {
  FileText,
  Plus,
  MousePointerClick,
  Trash2,
  Eye,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return "bg-green-50 text-green-600 border border-green-200";
    case "draft":
      return "bg-muted text-muted-foreground border border-border";
    case "archived":
      return "bg-red-50 text-red-600 border border-red-200";
    default:
      return "bg-muted text-muted-foreground border border-border";
  }
}

function triggerLabel(trigger: string) {
  switch (trigger) {
    case "exit_intent": return "Exit Intent";
    case "scroll": return "Scroll";
    case "timer": return "Timer";
    case "page_load": return "Page Load";
    default: return trigger;
  }
}

export default function FormsPage() {
  const { data: stores } = (trpc as any).stores.list.useQuery();
  const store = stores?.[0];
  const storeId = store?.id as string | undefined;

  const { data: forms, isLoading } = (trpc as any).forms.listForms.useQuery(
    { storeId: storeId ?? "" },
    { enabled: !!storeId }
  );

  const utils = trpc.useUtils();

  const deleteMut = (trpc as any).forms.deleteForm.useMutation({
    onSuccess: () => (utils as any).forms.listForms.invalidate(),
  });

  const updateMut = (trpc as any).forms.updateForm.useMutation({
    onSuccess: () => (utils as any).forms.listForms.invalidate(),
  });

  if (isLoading || !storeId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] tracking-[-0.5px] font-bold text-foreground font-mono">
            FORMS & POPUPS
          </h1>
          <p className="text-[13px] text-muted-foreground font-mono mt-1">
            Capture leads with embeddable forms and smart popups
          </p>
        </div>
        <Link
          href="/forms/new"
          className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-lg text-[11px] font-mono font-bold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          New Form
        </Link>
      </div>

      {/* Forms List */}
      {(!forms || forms.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl">
          <FileText className="w-10 h-10 text-muted-foreground/50 mb-4" />
          <p className="text-[13px] text-muted-foreground font-mono mb-4">
            No forms yet
          </p>
          <Link
            href="/forms/new"
            className="px-4 py-2 bg-foreground text-background rounded-lg text-[11px] font-mono font-bold hover:opacity-90 transition-opacity"
          >
            Create Your First Form
          </Link>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-4"
        >
          {forms.map((form: any) => (
            <motion.div
              key={form.id}
              variants={itemVariants}
              className="glass-card-static p-5 border border-border rounded-xl hover:border-foreground/20 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link
                      href={`/forms/${form.id}`}
                      className="text-[15px] font-bold text-foreground font-mono hover:underline"
                    >
                      {form.name}
                    </Link>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${statusBadge(form.status)}`}
                    >
                      {form.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {(form.fields as any[])?.length ?? 0} fields
                    </span>
                    <span className="flex items-center gap-1">
                      <MousePointerClick className="w-3 h-3" />
                      {form._count?.submissions ?? 0} submissions
                    </span>
                    {form.popups?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {form.popups.length} popup{form.popups.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* Popups */}
                  {form.popups?.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {form.popups.map((popup: any) => (
                        <span
                          key={popup.id}
                          className="px-2 py-1 rounded-md text-[10px] font-mono bg-muted border border-border"
                        >
                          {popup.name} — {triggerLabel(popup.trigger)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      updateMut.mutate({
                        formId: form.id,
                        status: form.status === "active" ? "draft" : "active",
                      })
                    }
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title={form.status === "active" ? "Deactivate" : "Activate"}
                  >
                    {form.status === "active" ? (
                      <ToggleRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="w-4 h-4" />
                    )}
                  </button>
                  <Link
                    href={`/forms/${form.id}`}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => {
                      if (confirm("Delete this form?")) {
                        deleteMut.mutate({ formId: form.id });
                      }
                    }}
                    className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
