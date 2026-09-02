import {
  prisma,
  getMarketingDeliveryPermission,
} from "@allohq/database";
import { send } from "@allohq/messaging";
import type { Channel } from "@allohq/messaging";
import { checkAllRules } from "@allohq/communication-governor";
import {
  routeAction,
  ActionCategory,
  ActionStatus,
} from "@allohq/autonomy-engine";
import type { ProposedAction } from "@allohq/autonomy-engine";
import type { ProactiveMessageInput, ProactiveMessageResult, OutreachType } from "./types";
import { selectBestChannel } from "./channel-selector";

/** Map outreach type to autonomy category */
function getActionCategory(outreachType: OutreachType): ActionCategory {
  switch (outreachType) {
    case "shipping_update":
      return ActionCategory.POST_PURCHASE;
    case "restock_alert":
      return ActionCategory.RESTOCK_ALERTS;
    case "price_drop":
      return ActionCategory.PRICE_DROP;
    case "repurchase_reminder":
      return ActionCategory.REPURCHASE;
  }
}

/**
 * Unified proactive message sending pipeline.
 *
 * Pipeline: dedup → channel select → governor → autonomy → MessageLog → send → fatigue → outreach log
 */
export async function sendProactiveMessage(
  input: ProactiveMessageInput,
): Promise<ProactiveMessageResult> {
  const { storeId, workspaceId, customerId, outreachType, referenceId } = input;

  // 1. Dedup check
  const existing = await prisma.proactiveOutreachLog.findUnique({
    where: {
      storeId_customerId_outreachType_referenceId: {
        storeId,
        customerId,
        outreachType,
        referenceId,
      },
    },
  });

  if (existing) {
    return { sent: false, reason: "Already sent (dedup)" };
  }

  // 2. Channel selection
  const channel: Channel = input.channel ?? (await selectBestChannel(customerId));

  // 3. Governor check — shipping updates are transactional (bypass fatigue)
  const messageType = outreachType === "shipping_update" ? "transactional" : "proactive";
  if (messageType !== "transactional") {
    const permission = await getMarketingDeliveryPermission(
      customerId,
      channel,
    );
    if (!permission.allowed) {
      await prisma.messageLog.create({
        data: {
          workspaceId,
          storeId,
          customerId,
          channel,
          to: "",
          status: "suppressed",
          error: `Contact permission: ${
            permission.reason ?? "permission_denied"
          }`,
          metadata: {
            outreachType,
            rule: "contact_permission",
            reason: permission.reason ?? null,
            detail: permission.detail ?? null,
          },
        },
      });
      return {
        sent: false,
        suppressed: true,
        reason: `Contact permission: ${
          permission.reason ?? "permission_denied"
        }`,
        channel,
      };
    }
  }
  const govCheck = await checkAllRules({
    customerId,
    storeId,
    channel,
    messageType,
  });

  if (!govCheck.allowed) {
    // Log suppression
    await prisma.messageLog.create({
      data: {
        workspaceId,
        storeId,
        customerId,
        channel,
        to: "",
        status: "suppressed",
        error: `Governor: ${govCheck.reason}`,
        metadata: { outreachType, rule: govCheck.rule },
      },
    });
    return { sent: false, suppressed: true, reason: `Governor: ${govCheck.reason}`, channel };
  }

  // 4. Autonomy routing (shipping updates auto-execute via AUTOPILOT tier)
  const category = getActionCategory(outreachType);
  const action: ProposedAction = {
    storeId,
    type: "proactive_outreach",
    category,
    reasoning: `Proactive ${outreachType} for customer`,
    payload: { customerId, outreachType, referenceId, channel },
  };

  const autonomyResult = await routeAction(action);

  // If not auto-executed and not approved, queue for review
  if (
    autonomyResult.status !== ActionStatus.EXECUTED &&
    autonomyResult.status !== ActionStatus.APPROVED
  ) {
    return {
      sent: false,
      reason: `Queued for merchant review (${autonomyResult.status})`,
      channel,
    };
  }

  // 5. Get customer contact info
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, phone: true },
  });

  if (!customer) {
    return { sent: false, reason: "Customer not found" };
  }

  const to =
    channel === "email"
      ? customer.email
      : customer.phone ?? "";

  if (!to) {
    return { sent: false, reason: `No contact info for channel ${channel}` };
  }

  // 6. Create MessageLog
  const messageLog = await prisma.messageLog.create({
    data: {
      workspaceId,
      storeId,
      customerId,
      channel,
      to,
      subject: input.subject,
      status: "queued",
      metadata: { outreachType, referenceId, ...input.metadata },
    },
  });

  // 7. Send
  const result = await send({
    channel,
    to,
    subject: input.subject,
    html: input.html,
    body: input.body,
    from: channel === "email" ? (process.env["RESEND_FROM_EMAIL"] ?? "noreply@allohq.com") : undefined,
  });

  // 8. Handle result
  if (result.status === "sent") {
    await prisma.messageLog.update({
      where: { id: messageLog.id },
      data: {
        status: "sent",
        externalId: result.externalId,
        provider: result.provider,
        sentAt: new Date(),
      },
    });

    // Log fatigue
    await prisma.customerFatigueLog.create({
      data: {
        customerId,
        storeId,
        channel,
        messageType: "proactive",
      },
    });

    // Log outreach (dedup record)
    await prisma.proactiveOutreachLog.create({
      data: {
        storeId,
        customerId,
        outreachType,
        referenceId,
        channel,
        messageLogId: messageLog.id,
      },
    });

    return { sent: true, messageLogId: messageLog.id, channel };
  }

  // Failed
  await prisma.messageLog.update({
    where: { id: messageLog.id },
    data: {
      status: "failed",
      provider: result.provider,
      error: result.error,
    },
  });

  return { sent: false, reason: result.error, channel };
}
