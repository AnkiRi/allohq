"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";

/**
 * Read requests, decide, and issue an invitation in one act.
 *
 * The invitation link appears exactly once, when it is created. Nothing stores
 * it and no later query can return it, so it is copied here or reissued.
 */
const ROLES = ["owner", "admin", "member", "viewer"] as const;

/**
 * Status colours, from the app's own semantic tokens rather than a new palette.
 * `attention` is something waiting on you, `evidence` is something you have
 * looked at, `success` is someone let in, `risk` is someone turned away.
 */
const STATUS_STYLE: Record<string, { label: string; color: string; background: string }> = {
  pending: { label: "Waiting on you", color: "var(--attention)", background: "var(--attention-soft)" },
  reviewed: { label: "Reviewed", color: "var(--evidence)", background: "var(--evidence-soft)" },
  invited: { label: "Invited", color: "var(--success-color)", background: "var(--success-soft)" },
  declined: { label: "Declined", color: "var(--risk)", background: "var(--risk-soft)" },
};

export function AccessRequestsConsole() {
  const utils = trpc.useUtils();
  const access = trpc.invitations.accessState.useQuery(undefined, { retry: false });
  const requests = trpc.accessRequests.list.useQuery(undefined, { retry: false });
  const [issued, setIssued] = React.useState<
    { id: string; email: string; workspaceName: string; token: string } | null
  >(null);

  const setStatus = trpc.accessRequests.setStatus.useMutation({
    onSuccess: () => utils.accessRequests.list.invalidate(),
  });
  const approve = trpc.accessRequests.approveAndInvite.useMutation({
    onSuccess: (result) => {
      setIssued({
        id: result.invitationId,
        email: result.email,
        workspaceName: result.workspaceName,
        token: result.token,
      });
      void utils.accessRequests.list.invalidate();
    },
  });

  const counts = React.useMemo(() => {
    if (!requests.data) return null;
    const tally: Record<string, number> = {};
    for (const request of requests.data) tally[request.status] = (tally[request.status] ?? 0) + 1;
    return tally;
  }, [requests.data]);

  if (access.isLoading) return null;
  if (!access.data?.isPlatformAdmin) {
    return (
      <div className="px-6 py-16 text-[13px] text-muted-foreground" data-testid="admin-denied">
        Nothing here.
      </div>
    );
  }

  return (
    <div data-testid="access-requests-console">
      <header className="border-b border-border pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Closed beta
        </p>
        <h1 className="mt-2 font-serif text-[26px] leading-tight text-foreground">
          Access requests
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
          Approving creates the invitation and shows its link once. You pass it
          on yourself — Joon does not email it while sender domains are still
          being set up.
        </p>
        {counts && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(["pending", "reviewed", "invited", "declined"] as const).map((status) => (
              <span
                key={status}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{
                  color: STATUS_STYLE[status]!.color,
                  background: STATUS_STYLE[status]!.background,
                }}
              >
                {counts[status] ?? 0} {STATUS_STYLE[status]!.label.toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </header>

      {issued && (
        <div
          className="mt-6 rounded-xl border border-border p-4"
          data-testid="issued-invitation"
        >
          <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
            Invitation created
          </p>
          <p className="mt-2 text-[13px] text-foreground">
            For <strong>{issued.email}</strong> in <strong>{issued.workspaceName}</strong>.
            This link is shown once.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-[var(--surface)] px-3 py-2 font-mono text-[12px] text-foreground">
            {typeof window === "undefined" ? "" : window.location.origin}/invite/{issued.token}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(
                `${window.location.origin}/invite/${issued.token}`
              );
            }}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground"
            data-testid="copy-invitation-link"
          >
            Copy invitation link
          </button>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {(requests.data ?? []).length === 0 && (
          <p className="text-[13px] text-muted-foreground">No requests yet.</p>
        )}
        {(requests.data ?? []).map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            busy={approve.isPending || setStatus.isPending}
            onStatus={(status) => setStatus.mutate({ id: request.id, status })}
            onApprove={(options) => approve.mutate({ id: request.id, ...options })}
          />
        ))}
      </div>
    </div>
  );
}

function RequestRow({
  request,
  busy,
  onStatus,
  onApprove,
}: {
  request: {
    id: string;
    email: string;
    name: string;
    company: string;
    website: string | null;
    platform: string;
    customerRange: string;
    note: string | null;
    status: string;
    createdAt: string | Date;
    existingAccount?: boolean;
    existingWorkspaceCount?: number;
  };
  busy: boolean;
  onStatus: (status: "pending" | "reviewed" | "declined") => void;
  onApprove: (options: {
    role: (typeof ROLES)[number];
    workspaceId?: string;
    newWorkspaceName?: string;
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState<(typeof ROLES)[number]>("owner");
  const [workspaceName, setWorkspaceName] = React.useState(request.company);
  const [existingWorkspaceId, setExistingWorkspaceId] = React.useState("");

  return (
    <div className="rounded-xl border border-border p-4" data-testid="access-request-row">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[14px] text-foreground">
            {request.company} · <span className="text-muted-foreground">{request.name}</span>
          </p>
          <p className="font-mono text-[12px] text-muted-foreground">{request.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {request.existingAccount && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ color: "var(--attention)", background: "var(--attention-soft)" }}
              title={`This address already has a Joon account in ${request.existingWorkspaceCount} workspace(s). Inviting it is not wrong — it will be added to another workspace — but it is worth knowing first.`}
              data-testid="existing-account-flag"
            >
              Has an account
            </span>
          )}
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              color: STATUS_STYLE[request.status]?.color ?? "var(--muted-foreground)",
              background: STATUS_STYLE[request.status]?.background ?? "transparent",
            }}
            data-testid="request-status"
          >
            {STATUS_STYLE[request.status]?.label ?? request.status}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[12px] text-muted-foreground">
        {request.platform.replaceAll("_", " ")} · {request.customerRange.replaceAll("_", " ")}
        {request.website ? ` · ${request.website}` : ""}
      </p>
      {request.note && <p className="mt-2 text-[13px] text-foreground">{request.note}</p>}

      {request.status !== "invited" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("reviewed")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground disabled:opacity-50"
          >
            Mark reviewed
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus("declined")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
            data-testid="approve-and-create-invite"
          >
            Approve &amp; create invite
          </button>
        </div>
      )}

      {open && request.status !== "invited" && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <label className="block">
            <span className="text-[12px] text-muted-foreground">Role</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as (typeof ROLES)[number])}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px]"
            >
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] text-muted-foreground">
              New workspace name — prefilled from the company
            </span>
            <input
              value={workspaceName}
              onChange={(event) => {
                setWorkspaceName(event.target.value);
                setExistingWorkspaceId("");
              }}
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px]"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-muted-foreground">
              …or an existing workspace id, which takes precedence
            </span>
            <input
              value={existingWorkspaceId}
              onChange={(event) => setExistingWorkspaceId(event.target.value)}
              placeholder="leave blank to create a new one"
              className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 font-mono text-[12px]"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onApprove(
                existingWorkspaceId.trim()
                  ? { role, workspaceId: existingWorkspaceId.trim() }
                  : { role, newWorkspaceName: workspaceName.trim() }
              )
            }
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
            data-testid="confirm-create-invite"
          >
            Create invitation
          </button>
        </div>
      )}
    </div>
  );
}
