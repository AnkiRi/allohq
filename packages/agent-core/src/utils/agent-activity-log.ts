import { prisma } from "@allohq/database";

interface LogActivityInput {
  storeId: string;
  activityType: string;
  summary: string;
  category?: string;
  tier?: string;
  actionTaken?: string;
  entityId?: string;
  entityType?: string;
  metadata?: any;
  revenue?: number;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  await prisma.agentActivityLog.create({ data: input });
}

export async function getRecentActivity(storeId: string, since: Date): Promise<any[]> {
  return prisma.agentActivityLog.findMany({
    where: { storeId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
}
