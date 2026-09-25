import { prisma as defaultPrisma, getStoreSenderIdentity } from "@allohq/database";
import { emailProviderConfigProblems } from "@allohq/messaging";
import { campaignAudienceSnapshot } from "@allohq/campaign-engine";

export type EmailProvider = "resend" | "ses";

/**
 * What switching new email traffic from one provider to the other would
 * strand, checked BEFORE the switch.
 *
 * `EMAIL_PROVIDER` is a global selector, not a failover control. Approved
 * campaigns pin the provider they were approved on and the worker refuses to
 * send them through the other one — which prevents duplicates, but means a
 * switch silently strands them. Sends already accepted by the old provider keep
 * producing bounce and complaint events for days, and those must still be read.
 * None of that was visible until after the switch; this makes it visible first.
 *
 * Read-only. It changes nothing and calls no provider.
 */
export interface EmailProviderSwitchPreflight {
  from: EmailProvider;
  to: EmailProvider;
  /** True only when nothing below blocks moving NEW traffic. */
  safeToSwitchNewTraffic: boolean;
  blockers: string[];
  notes: string[];
  targetConfigProblems: string[];
  campaignsPinnedToCurrent: Array<{ campaignId: string; storeId: string; status: string }>;
  sendingStoresWithoutTargetIdentity: Array<{ storeId: string; identityStatus: string | null }>;
  unsettledSesAttempts: number;
  sendsAwaitingEvents: number;
}

const RECENT_SENDING_DAYS = 30;
const EVENT_SETTLE_HOURS = 72;
const UNSETTLED_SES_STATES = ["reserved", "submitting", "ambiguous", "manual_review"];

export async function emailProviderSwitchPreflight(input: {
  from: EmailProvider;
  to: EmailProvider;
  env?: Record<string, string | undefined>;
  prisma?: any;
  now?: Date;
}): Promise<EmailProviderSwitchPreflight> {
  const prisma = input.prisma ?? defaultPrisma;
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const { from, to } = input;

  const report: EmailProviderSwitchPreflight = {
    from,
    to,
    safeToSwitchNewTraffic: false,
    blockers: [],
    notes: [],
    targetConfigProblems: [],
    campaignsPinnedToCurrent: [],
    sendingStoresWithoutTargetIdentity: [],
    unsettledSesAttempts: 0,
    sendsAwaitingEvents: 0,
  };
  if (from === to) {
    report.notes.push(`New traffic already goes through ${to}; there is nothing to switch.`);
    report.safeToSwitchNewTraffic = true;
    return report;
  }

  // 1. The target provider must be fully configured.
  report.targetConfigProblems = emailProviderConfigProblems(to, env);
  for (const problem of report.targetConfigProblems) report.blockers.push(`${to}: ${problem}`);

  // 2. Approved campaigns pinned to the current provider would be refused after
  // the switch — the worker fails closed rather than reroute them.
  const openCampaigns = await prisma.campaign.findMany({
    where: { status: { in: ["scheduled", "sending"] } },
    select: { id: true, storeId: true, status: true, agentProposal: true },
  });
  for (const campaign of openCampaigns) {
    const pinned = campaignAudienceSnapshot(campaign.agentProposal)?.deliveryProvider ?? "resend";
    if (pinned === from) {
      report.campaignsPinnedToCurrent.push({ campaignId: campaign.id, storeId: campaign.storeId, status: campaign.status });
    }
  }
  if (report.campaignsPinnedToCurrent.length) {
    report.blockers.push(
      `${report.campaignsPinnedToCurrent.length} scheduled or sending campaign(s) were approved on ${from} and would be refused after the switch. Let them finish first.`,
    );
  }

  // 3. Stores that send must already hold a verified identity on the target,
  // or the sender gate stops their mail the moment the switch lands.
  const since = new Date(now.getTime() - RECENT_SENDING_DAYS * 86_400_000);
  const recentSenders = await prisma.messageLog.groupBy({
    by: ["storeId"],
    where: { provider: { in: ["resend", "ses"] }, sentAt: { gte: since } },
  });
  const sendingStores = new Set<string>([
    ...recentSenders.map((row: { storeId: string }) => row.storeId),
    ...openCampaigns.map((campaign: { storeId: string }) => campaign.storeId),
  ]);
  for (const storeId of sendingStores) {
    const identity = await getStoreSenderIdentity(storeId, to);
    if (identity?.status !== "verified") {
      report.sendingStoresWithoutTargetIdentity.push({ storeId, identityStatus: identity?.status ?? null });
    }
  }
  if (report.sendingStoresWithoutTargetIdentity.length) {
    report.blockers.push(
      `${report.sendingStoresWithoutTargetIdentity.length} store(s) that send email have no verified ${to} sender identity. Verify each before switching.`,
    );
  }

  // 4. SES sends whose outcome is still unknown must be settled before SES
  // stops carrying traffic, or a later resend could duplicate them.
  report.unsettledSesAttempts = await prisma.sesDeliveryAttempt.count({
    where: { state: { in: UNSETTLED_SES_STATES } },
  });
  if (report.unsettledSesAttempts) {
    (from === "ses" ? report.blockers : report.notes).push(
      `${report.unsettledSesAttempts} SES delivery attempt(s) are unsettled (reserved, submitting, ambiguous or awaiting manual review).`,
    );
  }

  // 5. Mail the current provider has accepted keeps producing bounce and
  // complaint events. Its event intake must stay on after the switch.
  report.sendsAwaitingEvents = await prisma.messageLog.count({
    where: {
      provider: from,
      status: { in: ["queued", "sent"] },
      sentAt: { gte: new Date(now.getTime() - EVENT_SETTLE_HOURS * 3_600_000) },
    },
  });
  if (report.sendsAwaitingEvents) {
    const intakeConfigured = from === "ses"
      ? Boolean(env["SES_EVENT_QUEUE_URL"]?.trim())
      : Boolean(env["RESEND_WEBHOOK_SECRET"]?.trim());
    const intake = from === "ses" ? "SES_EVENT_QUEUE_URL" : "RESEND_WEBHOOK_SECRET";
    if (intakeConfigured) {
      report.notes.push(
        `${report.sendsAwaitingEvents} ${from} send(s) from the last ${EVENT_SETTLE_HOURS} hours are still awaiting delivery events. Keep ${intake} configured after the switch so their bounces and complaints are still recorded.`,
      );
    } else {
      report.blockers.push(
        `${report.sendsAwaitingEvents} ${from} send(s) are awaiting delivery events, but ${intake} is not configured, so their bounces and complaints would never be recorded.`,
      );
    }
  }

  report.safeToSwitchNewTraffic = report.blockers.length === 0;
  return report;
}
