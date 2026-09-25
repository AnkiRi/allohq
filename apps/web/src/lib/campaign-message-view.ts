/** A campaign's approved email is immutable even if its reusable template changes later. */
export function campaignMessageView(campaign: {
  status: string;
  template?: { blocks?: unknown; html?: string | null } | null;
  approvedEmailVersion?: { document?: unknown; contentHash?: string } | null;
}) {
  const document = campaign.approvedEmailVersion?.document;
  const frozen = document && typeof document === "object" && !Array.isArray(document)
    ? document as { blocks?: unknown }
    : null;
  const frozenBlocks = Array.isArray(frozen?.blocks) ? frozen.blocks : null;
  const editable = campaign.status === "draft";
  return {
    editable,
    frozen: frozenBlocks !== null,
    // Never substitute a subsequently edited library template for an approved
    // campaign. A missing historical snapshot is an unavailable preview.
    blocks: frozenBlocks ?? (editable && Array.isArray(campaign.template?.blocks) ? campaign.template.blocks : null),
    html: frozenBlocks || !editable ? null : campaign.template?.html ?? null,
    revision: campaign.approvedEmailVersion?.contentHash ?? null,
  };
}
