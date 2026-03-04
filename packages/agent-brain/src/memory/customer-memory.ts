import { prisma } from "@allohq/database";

export interface MemoryEntry {
  id: string;
  memoryType: string;
  content: string;
  source: string;
  confidence: number;
  createdAt: Date;
}

/** Write a new memory for a customer */
export async function addMemory(
  storeId: string,
  customerId: string,
  memoryType: string,
  content: string,
  source: string = "agent",
  confidence: number = 1.0
): Promise<MemoryEntry> {
  const memory = await prisma.customerMemory.create({
    data: { storeId, customerId, memoryType, content, source, confidence },
  });
  return memory;
}

/** Get all memories for a customer, optionally filtered by type */
export async function getMemories(
  customerId: string,
  memoryType?: string
): Promise<MemoryEntry[]> {
  return prisma.customerMemory.findMany({
    where: {
      customerId,
      ...(memoryType ? { memoryType } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Get memories for multiple customers at once (batch) */
export async function getMemoriesBatch(
  customerIds: string[]
): Promise<Map<string, MemoryEntry[]>> {
  const memories = await prisma.customerMemory.findMany({
    where: { customerId: { in: customerIds } },
    orderBy: { createdAt: "desc" },
  });

  const map = new Map<string, MemoryEntry[]>();
  for (const m of memories) {
    const list = map.get(m.customerId) ?? [];
    list.push(m);
    map.set(m.customerId, list);
  }
  return map;
}
