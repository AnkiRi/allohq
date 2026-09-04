export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "marketer",
  "approver",
  "analyst",
  "content_creator",
  "pending",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

const APPROVAL_MUTATIONS = new Set([
  "campaigns.schedule", "campaigns.sendNow", "campaigns.cancel",
  "automations.activate", "automations.pause", "automations.resume",
  "autonomy.approveAction", "autonomy.rejectAction",
  "autonomy.bulkApprove", "autonomy.bulkReject",
]);

const MARKETING_PREFIXES = [
  "campaigns.", "automations.", "segments.", "templates.", "emails.",
  "forms.", "ai.generate", "ai.regenerate", "ai.feedback",
];

const CONTENT_PREFIXES = [
  "templates.", "emails.", "ai.generate", "ai.regenerate", "ai.feedback",
  "ai.addBrandAsset", "ai.deleteBrandAsset", "ai.updateBrand",
];

export function canUseWorkspacePath(
  role: string | null | undefined,
  type: "query" | "mutation" | "subscription",
  path: string,
): boolean {
  if (role === "owner" || role === "admin") return true;
  if (!role || role === "member" || role === "pending") return false;
  if (type === "query") return true;
  if (type !== "mutation") return false;
  if (role === "analyst") return false;
  if (role === "approver") return APPROVAL_MUTATIONS.has(path);
  if (APPROVAL_MUTATIONS.has(path)) return false;
  if (role === "marketer") return MARKETING_PREFIXES.some((prefix) => path.startsWith(prefix));
  if (role === "content_creator") return CONTENT_PREFIXES.some((prefix) => path.startsWith(prefix));
  return false;
}
