const PROTECTED_DATA_ROUTES = new Set([
  "customers", "orders", "segments", "rfm", "analytics", "campaigns",
  "automations", "events", "recommendations",
]);

export function isProtectedDataRoute(path: string): boolean {
  return PROTECTED_DATA_ROUTES.has(path.split(".", 1)[0] ?? "");
}

export function protectedDataAuditRecord(input: {
  path: string; userId: string; workspaceId: string; authSource: string | null; occurredAt?: string;
}) {
  return {
    event: "protected_customer_data_access",
    path: input.path,
    actorId: input.userId,
    workspaceId: input.workspaceId,
    authSource: input.authSource ?? "unknown",
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  } as const;
}
