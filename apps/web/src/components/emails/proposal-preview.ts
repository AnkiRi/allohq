/** A proposal is a snapshot, not the merchant's live draft. */
export function proposalPreviewState(
  draftSignature: string,
  proposal: { baseSignature: string; candidateSignature: string; stale?: boolean } | null,
  requestedView: "before" | "proposed",
) {
  if (!proposal) return { showProposed: false, notice: null };

  const notice = proposal.stale
    ? "This suggestion belongs to an older saved email. Your current draft is shown. Reject it and ask Joon again."
    : draftSignature !== proposal.baseSignature
      ? "You edited the email after Joon made this suggestion. Your current draft is shown; reject the old suggestion and ask again if needed."
      : proposal.candidateSignature === proposal.baseSignature
        ? "Joon made no visible change. Your current draft is shown; reject this suggestion and try another instruction."
        : null;

  return { showProposed: !notice && requestedView === "proposed", notice };
}
