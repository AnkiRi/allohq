import { createHash } from "node:crypto";
import { emailDocumentSchema, type EmailDocument } from "@allohq/email-builder";

export function emailDocumentFromTemplate(template: {
  subject: string;
  previewText?: string | null;
  blocks: unknown;
}): EmailDocument {
  return emailDocumentSchema.parse({
    schemaVersion: 1,
    envelope: {
      subject: template.subject,
      previewText: template.previewText ?? "",
      locale: "en",
    },
    blocks: template.blocks,
    metadata: {},
  });
}

export function emailDocumentHash(document: EmailDocument): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex");
}

export async function ensureEmailVersion(
  prisma: any,
  input: {
    workspaceId: string;
    templateId: string;
    storeId?: string | null;
    template: { subject: string; previewText?: string | null; blocks: unknown };
    source: "manual" | "joon" | "restore" | "approval";
    note?: string;
    createdBy?: string | null;
  },
) {
  const document = emailDocumentFromTemplate(input.template);
  const contentHash = emailDocumentHash(document);
  const existing = await prisma.emailVersion.findFirst({
    where: { templateId: input.templateId, contentHash },
    orderBy: { sequence: "desc" },
  });
  if (existing) return existing;

  const latest = await prisma.emailVersion.findFirst({
    where: { templateId: input.templateId },
    select: { sequence: true },
    orderBy: { sequence: "desc" },
  });
  return prisma.emailVersion.create({
    data: {
      workspaceId: input.workspaceId,
      templateId: input.templateId,
      storeId: input.storeId ?? null,
      sequence: (latest?.sequence ?? 0) + 1,
      document: document as any,
      contentHash,
      source: input.source,
      note: input.note,
      createdBy: input.createdBy ?? null,
    },
  });
}
