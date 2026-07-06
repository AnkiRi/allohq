// Human-in-the-loop judgment capture. At the moment a human APPROVES a campaign, diff the
// action bundle allo proposed (frozen in campaign.agentProposal at draft time) against the
// human's final state → a structured agent_proposed → human_final record. This disagreement
// signal (plus the campaign's later outcome) is the highest-value training data for the CAM:
// it's how the model eventually learns the human's judgment and the forward-deployed team recedes.
//
// Content/creative edits are NOT deep-captured (they live in the email content, not campaign
// fields) — only a magnitude flag. Action variables (segment, timing) are captured precisely.

type CampaignForDecision = {
  agentProposal: unknown;
  segmentId: string | null;
  scheduledAt: Date | null;
};

type AgentProposal = {
  segmentId?: string | null;
  segmentName?: string | null;
  scheduledAt?: string | null;
  discountPercent?: number | null;
  intent?: string | null;
  recipientCount?: number;
};

export function buildHumanDecision(c: CampaignForDecision): Record<string, unknown> {
  const approvedAt = new Date().toISOString();
  const p = (c.agentProposal ?? null) as AgentProposal | null;
  if (!p) return { approvedAt, note: "no agent proposal recorded (pre-capture campaign)" };

  const overrides: Record<string, { proposed: unknown; final: unknown }> = {};
  if ((p.segmentId ?? null) !== (c.segmentId ?? null)) {
    overrides.segment = { proposed: p.segmentName ?? p.segmentId ?? null, final: c.segmentId };
  }
  const finalScheduled = c.scheduledAt ? c.scheduledAt.toISOString() : null;
  if ((p.scheduledAt ?? null) !== finalScheduled) {
    overrides.timing = { proposed: p.scheduledAt ?? null, final: finalScheduled };
  }

  const changedFields = Object.keys(overrides);
  return {
    approvedAt,
    acceptedAsProposed: changedFields.length === 0, // human shipped allo's proposal unchanged
    changedFields,
    overrides, // agent_proposed → human_final on the structured action variables
    // discount/offer/creative live in the email content, not campaign columns → flag, don't deep-capture
    contentEditedFlag: null,
  };
}
