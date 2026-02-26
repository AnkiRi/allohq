"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { EmailCanvas } from "@/components/email-builder/EmailCanvas";
import type { EmailBlock } from "@allohq/email-builder";

export default function EditTemplatePage() {
  const params = useParams();
  const templateId = params.id as string;
  const { toast } = useToast();

  const { data: template, isLoading } = trpc.templates.getById.useQuery({ id: templateId }) as {
    data: { id: string; name: string; subject: string; blocks: unknown } | undefined;
    isLoading: boolean;
  };
  const updateMut = trpc.templates.update.useMutation();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubject(template.subject);
    }
  }, [template]);

  async function handleSave(blocks: EmailBlock[]) {
    await updateMut.mutateAsync({
      id: templateId,
      name,
      subject,
      blocks: blocks as any,
    });
    toast("Template saved!", "success");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[13px] text-muted-foreground font-mono">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[13px] text-muted-foreground font-mono">Template not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link href="/templates" className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </Link>
        <div className="flex-1 flex items-center gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-[18px] tracking-[-0.5px] font-bold text-foreground font-mono bg-transparent border-none outline-none"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-[13px] text-muted-foreground font-mono bg-transparent border border-border rounded-lg px-3 py-1.5 outline-none focus:border-muted-foreground w-64"
            placeholder="Subject line..."
          />
        </div>
      </div>
      <EmailCanvas
        initialBlocks={template.blocks as unknown as EmailBlock[]}
        templateId={templateId}
        onSave={handleSave}
      />
    </div>
  );
}
