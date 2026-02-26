"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/components/ui/Toast";
import { EmailCanvas } from "@/components/email-builder/EmailCanvas";
import type { EmailBlock } from "@allohq/email-builder";

export default function NewTemplatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("Untitled Template");
  const [subject, setSubject] = useState("");
  const createMut = trpc.templates.create.useMutation();

  async function handleSave(blocks: EmailBlock[]) {
    const template = await createMut.mutateAsync({
      name,
      subject: subject || name,
      blocks: blocks as any,
    });
    toast("Template created!", "success");
    router.push(`/templates/${template.id}/edit`);
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
            placeholder="Template name..."
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="text-[13px] text-muted-foreground font-mono bg-transparent border border-border rounded-lg px-3 py-1.5 outline-none focus:border-muted-foreground w-64"
            placeholder="Subject line..."
          />
        </div>
      </div>
      <EmailCanvas onSave={handleSave} />
    </div>
  );
}
