import { createHash } from "node:crypto";
import { prisma } from "@allohq/database";

export interface AutomationActivationSnapshot {
  automationId: string;
  storeId: string;
  name: string;
  category: string;
  triggerType: string;
  triggerConfig: unknown;
  nodes: unknown;
  templates: Array<{
    id: string;
    subject: string;
    previewText: string | null;
    blocks: unknown;
    html: string | null;
  }>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export function automationActivationChecksum(
  snapshot: AutomationActivationSnapshot,
): string {
  const ordered = {
    ...snapshot,
    templates: [...snapshot.templates].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical(ordered)))
    .digest("hex");
}

export async function loadAutomationActivationSnapshot(
  automationId: string,
): Promise<AutomationActivationSnapshot | null> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
  });
  if (!automation) return null;
  const templates = automation.templateIds.length
    ? await prisma.emailTemplate.findMany({
        where: { id: { in: automation.templateIds } },
        select: { id: true, subject: true, previewText: true, blocks: true, html: true },
      })
    : [];
  return {
    automationId: automation.id,
    storeId: automation.storeId,
    name: automation.name,
    category: automation.category,
    triggerType: automation.triggerType,
    triggerConfig: automation.triggerConfig,
    nodes: automation.nodes,
    templates,
  };
}
