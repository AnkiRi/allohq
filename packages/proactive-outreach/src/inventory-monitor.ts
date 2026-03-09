import { prisma } from "@allohq/database";

interface LowStockAlert {
  productId: string;
  productTitle: string;
  totalInventory: number;
  automationId: string;
  automationName: string;
}

const LOW_STOCK_THRESHOLD = 5;

/**
 * Check inventory levels for products referenced in active automations.
 * If any product drops below threshold, create an ActionQueue alert for the merchant.
 */
export async function checkInventoryLevels(
  storeId: string,
): Promise<LowStockAlert[]> {
  // Find all active automations for this store
  const automations = await prisma.automation.findMany({
    where: { storeId, status: "active" },
    select: { id: true, name: true, nodes: true },
  });

  if (automations.length === 0) return [];

  // Extract product IDs from automation nodes → templates → blocks
  const productAutomationMap = new Map<string, Set<string>>(); // productId → Set<automationId>

  for (const automation of automations) {
    const nodes = (automation.nodes ?? []) as unknown as Array<{
      type: string;
      config: Record<string, unknown>;
    }>;

    const templateIds: string[] = [];
    for (const node of nodes) {
      if (node.config.templateId) templateIds.push(node.config.templateId as string);
      if (node.config.smsTemplateId) templateIds.push(node.config.smsTemplateId as string);
    }

    if (templateIds.length === 0) continue;

    // Load email templates and extract product IDs from blocks
    const templates = await prisma.emailTemplate.findMany({
      where: { id: { in: templateIds } },
      select: { id: true, blocks: true },
    });

    for (const template of templates) {
      const blocks = (template.blocks ?? []) as unknown as Array<{
        type: string;
        props: { productId?: string; productIds?: string[] };
      }>;

      for (const block of blocks) {
        if (block.type === "product" && block.props.productId) {
          if (!productAutomationMap.has(block.props.productId)) {
            productAutomationMap.set(block.props.productId, new Set());
          }
          productAutomationMap.get(block.props.productId)!.add(automation.id);
        }
        if (block.type === "product_grid" && block.props.productIds) {
          for (const pid of block.props.productIds) {
            if (!productAutomationMap.has(pid)) {
              productAutomationMap.set(pid, new Set());
            }
            productAutomationMap.get(pid)!.add(automation.id);
          }
        }
      }
    }
  }

  if (productAutomationMap.size === 0) return [];

  const productIds = Array.from(productAutomationMap.keys());

  // Check inventory for each product
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      title: true,
      variants: { select: { inventory: true } },
    },
  });

  const alerts: LowStockAlert[] = [];

  for (const product of products) {
    const totalInventory = product.variants.reduce((sum, v) => sum + v.inventory, 0);

    if (totalInventory < LOW_STOCK_THRESHOLD) {
      const automationIds = productAutomationMap.get(product.id);
      if (!automationIds) continue;

      for (const automationId of automationIds) {
        const automation = automations.find((a) => a.id === automationId);
        if (!automation) continue;

        // Check if we already have a pending alert for this product+automation
        const existingAlert = await prisma.actionQueue.findFirst({
          where: {
            storeId,
            type: "alert",
            status: "pending",
            payload: {
              path: ["productId"],
              equals: product.id,
            },
          },
        });

        if (existingAlert) continue;

        await prisma.actionQueue.create({
          data: {
            storeId,
            type: "alert",
            category: "support",
            urgencyScore: 80,
            confidenceScore: 95,
            reasoning: `Low stock alert: "${product.title}" has only ${totalInventory} units remaining and is referenced in automation "${automation.name}".`,
            payload: {
              productId: product.id,
              productTitle: product.title,
              totalInventory,
              automationId: automation.id,
              automationName: automation.name,
              threshold: LOW_STOCK_THRESHOLD,
            },
          },
        });

        alerts.push({
          productId: product.id,
          productTitle: product.title,
          totalInventory,
          automationId: automation.id,
          automationName: automation.name,
        });
      }
    }
  }

  if (alerts.length > 0) {
    console.log(`[inventory-monitor] Created ${alerts.length} low-stock alerts for store ${storeId}`);
  }

  return alerts;
}
