"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc";

/**
 * Read requests, decide, and issue an invitation in one act.
 *
 * Every button comes from `allowedActions` on the server. The console does not
 * work out what is possible — it renders what it was told, so the screen and
 * the rules cannot drift apart. Before this, every action stayed available
 * after every decision: a request could be declined twice, or marked reviewed
 * again, with no finality and no feedback. Disabling buttons would not have
 * fixed it, because the server accepted the repeat either way.
 *
 * The invitation link appears exactly once, when it is created. Nothing stores
 * it and no later query can return it, so it is copied here or reissued.
 */
const ROLES = ["owner", "admin", "member", "viewer"] as const;

const STATUS_STYLE: Record<string, { label: string; color: string; background: string }> = {
  pending: { label: "Waiting on you", color: "var(--attention)", background: "var(--attention-soft)" },
  reviewed: { label: "Reviewed", color: "var(--evidence)", background: "var(--evidence-soft)" },
  invited: { label: "Invited", color: "var(--success-color)", background: "var(--success-soft)" },
  declined: { label: "Declined", color: "var(--risk)", background: "var(--risk-soft)" },
};

const ACTION_LABEL: Record<string, string> = {
  mark_reviewed: "Mark reviewed",
  approve: "Approve & create invite",
  decline: "Decline",
  reopen: "Reopen request",
  revoke_invitation: "Revoke invitation",
};

type Decision = {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  actorClerkId: string;
  reason: string | null;
  createdAt: string | Date;
};

type RequestRow = {
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
  invitationState?: string;
  invitationRole?: string | null;
  invitationWorkspaceName?: string | null;
  invitationExpiresAt?: string | Date | null;
  allowedActions?: string[];
  summary?: string;
  decisions?: Decision[];
};

export function AccessRequestsConsole() {
  const utils = trpc.useUtils();
  const access = trpc.invitations.accessState.useQuery(undefined, { retry: false });
  const requests = trpc.accessRequests.list.useQuery(undefined, { retry: false });
  const [issued, setIssued] = React.useState<
    { id: string; email: string; workspaceName: string; token: string } | null
  >(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Every mutation refetches before it lets go, so the row a decision lands on
  // is the row the next click sees.
  const settle = async () => {
    await utils.accessRequests.list.invalidate();
    setBusyId(null);
  };

  const decide = trpc.accessRequests.decide.useMutation({
    onMutate: (input) => {
      setProblem(null);
      setBusyId(input.id);
    },
    onError: (error) => setProblem(error.message),
    onSettled: settle,
  });

  const approve = trpc.accessRequests.approveAndInvite.useMutation({
    onMutate: (input) => {
      setProblem(null);
      setBusyId(input.id);
    },
    onSuccess: (result) =>
      setIssued({
        id: result.invitationId,
        email: result.email,
        workspaceName: result.workspaceName,
        token: result.token,
      }),
    onError: (error) => setProblem(error.message),
    onSettled: settle,
  });

  const rows = (requests.data ?? []) as RequestRow[];
  const counts = React.useMemo(() => {
    const tally: Record<string, number> = {};
    for (const row of rows) tally[row.status] = (tally[row.status] ?? 0) + 1;
    return tally;
  }, [rows]);

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
        <div className="mt-4 flex flex-wrap gap-2">
          {(["pending", "reviewed", "invited", "declined"] as const).map((status) => (
            <span
              key={status}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ color: STATUS_STYLE[status]!.color, background: STATUS_STYLE[status]!.background }}
            >
              {counts[status] ?? 0} {STATUS_STYLE[status]!.label.toLowerCase()}
            </span>
          ))}
        </div>
      </header>

      {problem && (
        <div
          className="mt-5 rounded-xl px-4 py-3 text-[13px]"
          style={{ color: "var(--risk)", background: "var(--risk-soft)" }}
          role="alert"
          data-testid="decision-error"
        >
          {problem}
        </div>
      )}

      {issued && (
        <div className="mt-6 rounded-xl border border-border p-4" data-testid="issued-invitation">
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
              void navigator.clipboard?.writeText(`${window.location.origin}/invite/${issued.token}`);
            }}
            className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground"
            data-testid="copy-invitation-link"
          >
            Copy invitation link
          </button>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {rows.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No requests yet.</p>
        )}
        {rows.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            busy={busyId === request.id}
            onDecide={(action, reason) => decide.mutate({ id: request.id, action, reason })}
            onApprove={(options) => approve.mutate({ id: request.id, ...options })}
          />
        ))}
      </div>
    </div>
  );
}

function RequestCard({
  request,
  busy,
  onDecide,
  onApprove,
}: {
  request: RequestRow;
  busy: boolean;
  onDecide: (
    action: "mark_reviewed" | "decline" | "reopen" | "revoke_invitation",
    reason?: string
  ) => void;
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

  const allowed = request.allowedActions ?? [];
  const style = STATUS_STYLE[request.status];
  const trail = request.decisions ?? [];

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
              title={`This address already has a Joon account in ${request.existingWorkspaceCount} workspace(s).`}
              data-testid="existing-account-flag"
            >
              Has an account
            </span>
          )}
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              color: style?.color ?? "var(--muted-foreground)",
              background: style?.background ?? "transparent",
            }}
            data-testid="request-status"
          >
            {style?.label ?? request.status}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[12px] text-muted-foreground">
        {request.platform.replaceAll("_", " ")} · {request.customerRange.replaceAll("_", " ")}
        {request.website ? ` · ${request.website}` : ""}
      </p>
      {request.note && <p className="mt-2 text-[13px] text-foreground">{request.note}</p>}

      {/* What state this is in, in the server's words, so the explanation and
          the buttons can never disagree. */}
      {request.summary && (
        <p className="mt-3 text-[13px] text-foreground" data-testid="request-summary">
          {request.summary}
          {request.invitationWorkspaceName && request.invitationState === "live" && (
            <span className="text-muted-foreground">
              {" "}
              {request.invitationRole} of {request.invitationWorkspaceName}
              {request.invitationExpiresAt
                ? `, expires ${new Date(request.invitationExpiresAt).toLocaleDateString("en-IN")}`
                : ""}
              .
            </span>
          )}
        </p>
      )}

      {trail.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
            {trail.length} decision{trail.length === 1 ? "" : "s"}
          </summary>
          <ol className="mt-2 space-y-1 border-l border-border pl-3" data-testid="decision-trail">
            {trail.map((decision) => (
              <li key={decision.id} className="text-[12px] text-muted-foreground">
                <span className="text-foreground">{ACTION_LABEL[decision.action] ?? decision.action}</span>
                {" · "}
                {new Date(decision.createdAt).toLocaleString("en-IN")}
                {decision.reason ? ` · ${decision.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}

      {allowed.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {allowed
            .filter((action) => action !== "approve")
            .map((action) => (
              <button
                key={action}
                type="button"
                disabled={busy}
                onClick={() =>
                  onDecide(action as "mark_reviewed" | "decline" | "reopen" | "revoke_invitation")
                }
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground disabled:opacity-50"
                data-testid={`action-${action}`}
              >
                {busy ? "Working…" : ACTION_LABEL[action] ?? action}
              </button>
            ))}
          {allowed.includes("approve") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen((value) => !value)}
              className="rounded-lg bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
              data-testid="approve-and-create-invite"
            >
              {ACTION_LABEL.approve}
            </button>
          )}
        </div>
      )}

      {open && allowed.includes("approve") && (
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
            onClick={() => {
              setOpen(false);
              onApprove(
                existingWorkspaceId.trim()
                  ? { role, workspaceId: existingWorkspaceId.trim() }
                  : { role, newWorkspaceName: workspaceName.trim() }
              );
            }}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
            data-testid="confirm-create-invite"
          >
            {busy ? "Creating…" : "Create invitation"}
          </button>
        </div>
      )}
    </div>
  );
}
