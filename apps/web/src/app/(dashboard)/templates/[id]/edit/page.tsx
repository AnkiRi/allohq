"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmailStudio } from "@/components/emails/EmailStudio";
import type { EmailBlock } from "@allohq/email-builder";

/**
 * The ONE email editor. Every "edit this email" entry point — the template
 * library, a campaign's "Edit template", an automation's "Edit", the chat's
 * "View Template" — routes to /templates/[id]/edit, which now loads the good
 * allo-native EmailStudio (soft BrandEmailLayout render, "tell allo what to
 * change", chips, block editing as the hand-tweak path, persistent Save) with
 * the email by id.
 *
 * The old harsh block canvas (hard-black heroes, blue timers, "Select a block
 * to edit", "Rewrite coming soon") is retired — this route no longer renders it.
 */
export default function EditTemplatePage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const { data, isLoading, error } = (trpc.templates.getById as any).useQuery(
    { id },
    { enabled: !!id },
  ) as {
    data:
      | { blocks: unknown; subject?: string; previewText?: string; name?: string }
      | undefined;
    isLoading: boolean;
    error: unknown;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto py-32 text-center">
        <p className="text-[15px] font-serif font-semibold text-foreground mb-1">
          That email isn&apos;t here
        </p>
        <p className="text-[13px] font-sans text-muted-foreground mb-5">
          It may have been removed or belongs to another workspace.
        </p>
        <Link
          href="/templates"
          className="inline-flex items-center gap-1.5 text-[13px] font-sans text-[var(--color-accent)] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to the library
        </Link>
      </div>
    );
  }

  return (
    <EmailStudio
      templateId={id}
      initialBlocks={(data.blocks ?? []) as EmailBlock[]}
      initialSubject={data.subject ?? ""}
      initialPreviewText={data.previewText ?? ""}
      initialHtml=""
      previewVariables={{ first_name: "there", last_order_month: "recently" }}
    />
  );
}
