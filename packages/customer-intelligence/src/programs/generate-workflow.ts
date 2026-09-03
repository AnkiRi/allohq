export interface GenerateWorkflowInput {
  programType: string;
  templateIds: string[];
  whatsappTemplateIds?: string[];
  smsTemplateIds?: string[];
  rcsTemplateIds?: string[];
  triggerConfig: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: "send_email" | "send_sms" | "send_whatsapp" | "send_rcs" | "wait" | "condition" | "webhook";
  config: Record<string, unknown>;
}

export interface GenerateWorkflowOutput {
  triggerType: "event" | "schedule" | "segment_entry" | "segment_exit";
  triggerConfig: Record<string, unknown>;
  nodes: WorkflowNode[];
}

let nodeCounter = 0;
function nextId(): string {
  return `wn_${++nodeCounter}`;
}

function emailNode(templateId: string): WorkflowNode {
  return { id: nextId(), type: "send_email", config: { templateId } };
}

function waitNode(duration: number, unit: "hours" | "days"): WorkflowNode {
  return { id: nextId(), type: "wait", config: { duration, unit } };
}

function whatsappNode(templateId: string): WorkflowNode {
  return { id: nextId(), type: "send_whatsapp", config: { whatsappTemplateId: templateId } };
}

function smsNode(templateId: string): WorkflowNode {
  return { id: nextId(), type: "send_sms", config: { smsTemplateId: templateId } };
}

function rcsNode(templateId: string): WorkflowNode {
  return { id: nextId(), type: "send_rcs", config: { rcsTemplateId: templateId } };
}

function conditionNode(condition: string): WorkflowNode {
  return { id: nextId(), type: "condition", config: { condition } };
}

/**
 * Generate a multi-channel workflow with email + SMS + WhatsApp + RCS nodes.
 * Every program type gets all channels interleaved for maximum reach.
 */
export function generateWorkflow(input: GenerateWorkflowInput): GenerateWorkflowOutput {
  nodeCounter = 0;
  const { programType, templateIds, whatsappTemplateIds, smsTemplateIds, rcsTemplateIds } = input;
  const t = (index: number) => templateIds[index] ?? templateIds[0] ?? "";
  const w = (index: number) => whatsappTemplateIds?.[index] ?? whatsappTemplateIds?.[0];
  const s = (index: number) => smsTemplateIds?.[index] ?? smsTemplateIds?.[0];
  const r = (index: number) => rcsTemplateIds?.[index] ?? rcsTemplateIds?.[0];
  const hasWhatsApp = whatsappTemplateIds && whatsappTemplateIds.length > 0;
  const hasSms = smsTemplateIds && smsTemplateIds.length > 0;
  const hasRcs = rcsTemplateIds && rcsTemplateIds.length > 0;

  switch (programType) {
    // -----------------------------------------------------------------------
    // WELCOME SERIES — email → sms → email → whatsapp → email
    // -----------------------------------------------------------------------
    case "welcome_series": {
      const nodes: WorkflowNode[] = [emailNode(t(0))];
      if (hasSms) {
        nodes.push(waitNode(1, "days"), smsNode(s(0)!));
      }
      nodes.push(waitNode(2, "days"), emailNode(t(1)));
      if (hasRcs) {
        nodes.push(waitNode(1, "days"), rcsNode(r(0)!));
      } else if (hasWhatsApp) {
        nodes.push(waitNode(1, "days"), whatsappNode(w(0)!));
      }
      nodes.push(waitNode(2, "days"), emailNode(t(2)));
      return {
        triggerType: "event",
        triggerConfig: { event: "customer_created" },
        nodes,
      };
    }

    // -----------------------------------------------------------------------
    // ABANDONED CART — sms (urgent) → email → whatsapp → email
    // -----------------------------------------------------------------------
    case "abandoned_cart": {
      const nodes: WorkflowNode[] = [];
      // SMS first — fastest, most urgent channel
      if (hasSms) {
        nodes.push(waitNode(1, "hours"), smsNode(s(0)!));
        nodes.push(waitNode(2, "hours"));
      } else {
        nodes.push(waitNode(1, "hours"));
      }
      nodes.push(emailNode(t(0)));
      // RCS for rich product carousel, fallback to WhatsApp
      if (hasRcs) {
        nodes.push(waitNode(6, "hours"), rcsNode(r(0)!));
      }
      if (hasWhatsApp) {
        nodes.push(waitNode(6, "hours"), whatsappNode(w(0)!));
      }
      nodes.push(waitNode(12, "hours"), conditionNode("has_purchased"));
      nodes.push(emailNode(t(1)));
      return {
        triggerType: "event",
        triggerConfig: { event: "cart_abandoned" },
        nodes,
      };
    }

    // -----------------------------------------------------------------------
    // POST PURCHASE — email → sms (review ask) → email
    // -----------------------------------------------------------------------
    case "post_purchase": {
      const nodes: WorkflowNode[] = [
        waitNode(1, "days"),
        emailNode(t(0)),
      ];
      if (hasSms) {
        nodes.push(waitNode(3, "days"), smsNode(s(0)!));
      }
      nodes.push(waitNode(2, "days"), emailNode(t(1)));
      if (hasWhatsApp) {
        nodes.push(waitNode(3, "days"), whatsappNode(w(0)!));
      }
      return {
        triggerType: "event",
        triggerConfig: { event: "order_placed" },
        nodes,
      };
    }

    // -----------------------------------------------------------------------
    // WIN BACK — email → sms → whatsapp → email (escalating urgency)
    // -----------------------------------------------------------------------
    case "win_back": {
      const nodes: WorkflowNode[] = [emailNode(t(0))];
      if (hasSms) {
        nodes.push(waitNode(2, "days"), smsNode(s(0)!));
      }
      if (hasWhatsApp) {
        nodes.push(waitNode(3, "days"), whatsappNode(w(0)!));
      }
      nodes.push(waitNode(4, "days"), emailNode(t(1)));
      return {
        triggerType: "segment_entry",
        triggerConfig: { segmentName: "At Risk" },
        nodes,
      };
    }

    case "replenishment": {
      return {
        triggerType: "schedule",
        triggerConfig: { schedule: "daily", audience: "reorder_due" },
        nodes: [emailNode(t(0)), waitNode(3, "days"), conditionNode("has_purchased"), emailNode(t(1))],
      };
    }

    case "customer_milestone": {
      return {
        triggerType: "segment_entry",
        triggerConfig: { segmentName: "Loyal Customers" },
        nodes: [emailNode(t(0))],
      };
    }

    // -----------------------------------------------------------------------
    // BROWSE ABANDONMENT — sms (quick nudge) → email
    // -----------------------------------------------------------------------
    case "browse_abandonment": {
      const nodes: WorkflowNode[] = [];
      if (hasSms) {
        nodes.push(waitNode(1, "hours"), smsNode(s(0)!));
        nodes.push(waitNode(2, "hours"));
      } else {
        nodes.push(waitNode(2, "hours"));
      }
      nodes.push(emailNode(t(0)));
      if (hasWhatsApp) {
        nodes.push(waitNode(1, "days"), whatsappNode(w(0)!));
      }
      return {
        triggerType: "event",
        triggerConfig: { event: "product_viewed" },
        nodes,
      };
    }

    // -----------------------------------------------------------------------
    // VIP REWARD — whatsapp (personal) → email → sms
    // -----------------------------------------------------------------------
    case "vip_reward": {
      const nodes: WorkflowNode[] = [];
      // RCS is the premium channel — branded rich card for VIPs
      if (hasRcs) {
        nodes.push(rcsNode(r(0)!), waitNode(1, "days"));
      } else if (hasWhatsApp) {
        nodes.push(whatsappNode(w(0)!), waitNode(1, "days"));
      }
      nodes.push(emailNode(t(0)));
      if (hasSms) {
        nodes.push(waitNode(2, "days"), smsNode(s(0)!));
      }
      if (hasWhatsApp && hasRcs) {
        nodes.push(waitNode(1, "days"), whatsappNode(w(0)!));
      }
      return {
        triggerType: "segment_entry",
        triggerConfig: { segmentName: "Champions" },
        nodes,
      };
    }

    // -----------------------------------------------------------------------
    // RE-ENGAGEMENT — email → sms → whatsapp → email
    // -----------------------------------------------------------------------
    case "re_engagement": {
      const nodes: WorkflowNode[] = [emailNode(t(0))];
      if (hasSms) {
        nodes.push(waitNode(3, "days"), smsNode(s(0)!));
      }
      if (hasWhatsApp) {
        nodes.push(waitNode(3, "days"), whatsappNode(w(0)!));
      }
      nodes.push(waitNode(3, "days"), emailNode(t(1)));
      return {
        triggerType: "segment_entry",
        triggerConfig: { segmentName: "Hibernating" },
        nodes,
      };
    }

    // -----------------------------------------------------------------------
    // SEASONAL — email + sms blast
    // -----------------------------------------------------------------------
    case "seasonal": {
      const nodes: WorkflowNode[] = [emailNode(t(0))];
      if (hasSms) {
        nodes.push(smsNode(s(0)!));
      }
      if (hasWhatsApp) {
        nodes.push(waitNode(1, "days"), whatsappNode(w(0)!));
      }
      return {
        triggerType: "schedule",
        triggerConfig: { schedule: "manual" },
        nodes,
      };
    }

    // -----------------------------------------------------------------------
    // DEFAULT — email cascade with sms/whatsapp interspersed
    // -----------------------------------------------------------------------
    default: {
      const nodes: WorkflowNode[] = [];
      for (let i = 0; i < templateIds.length; i++) {
        if (i > 0) nodes.push(waitNode(2, "days"));
        nodes.push(emailNode(templateIds[i]!));
      }
      if (hasSms) {
        nodes.push(waitNode(1, "days"), smsNode(s(0)!));
      }
      if (hasWhatsApp) {
        nodes.push(waitNode(1, "days"), whatsappNode(w(0)!));
      }
      return {
        triggerType: "event",
        triggerConfig: { event: "order_placed" },
        nodes,
      };
    }
  }
}
