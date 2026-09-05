export interface AutomationSkeletonNode {
  id: string;
  type: "delay" | "condition" | "send_email";
  config: Record<string, unknown>;
  next?: string | null;
  nextYes?: string | null;
  nextNo?: string | null;
}

/**
 * Timing and branching only. Creative copy is deliberately absent: the
 * automation generator must replace every email placeholder using the current
 * merchant BrandProfile before the automation can enter `ready`.
 */
export function buildDefaultNodes(category: string): AutomationSkeletonNode[] {
  switch (category) {
    case "win_back":
      return [
        { id: "1", type: "delay", config: { days: 0 }, next: "2" },
        { id: "2", type: "send_email", config: { pendingBrandGeneration: true }, next: "3" },
        { id: "3", type: "delay", config: { days: 3 }, next: "4" },
        { id: "4", type: "condition", config: { check: "opened_email" }, nextYes: "5", nextNo: null },
        { id: "5", type: "send_email", config: { pendingBrandGeneration: true }, next: null },
      ];
    case "welcome_series":
      return [
        { id: "1", type: "send_email", config: { pendingBrandGeneration: true }, next: "2" },
        { id: "2", type: "delay", config: { days: 2 }, next: "3" },
        { id: "3", type: "send_email", config: { pendingBrandGeneration: true }, next: "4" },
        { id: "4", type: "delay", config: { days: 5 }, next: "5" },
        { id: "5", type: "send_email", config: { pendingBrandGeneration: true }, next: null },
      ];
    case "abandoned_cart":
      return [
        { id: "1", type: "delay", config: { hours: 1 }, next: "2" },
        { id: "2", type: "send_email", config: { pendingBrandGeneration: true }, next: "3" },
        { id: "3", type: "delay", config: { days: 1 }, next: "4" },
        { id: "4", type: "send_email", config: { pendingBrandGeneration: true }, next: null },
      ];
    case "post_purchase":
      return [
        { id: "1", type: "delay", config: { days: 3 }, next: "2" },
        { id: "2", type: "send_email", config: { pendingBrandGeneration: true }, next: "3" },
        { id: "3", type: "delay", config: { days: 14 }, next: "4" },
        { id: "4", type: "send_email", config: { pendingBrandGeneration: true }, next: null },
      ];
    default:
      return [
        { id: "1", type: "delay", config: { days: 0 }, next: "2" },
        { id: "2", type: "send_email", config: { pendingBrandGeneration: true }, next: null },
      ];
  }
}
