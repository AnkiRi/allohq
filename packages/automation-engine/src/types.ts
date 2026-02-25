/** A trigger that starts a workflow */
export interface Trigger {
  id: string;
  type: "event" | "schedule" | "segment_entry" | "segment_exit";
  config: Record<string, unknown>;
}

/** An action performed in a workflow */
export interface Action {
  id: string;
  type: "send_email" | "send_sms" | "send_whatsapp" | "wait" | "condition" | "split" | "webhook";
  config: Record<string, unknown>;
}

/** A node in a workflow graph */
export interface WorkflowNode {
  id: string;
  trigger?: Trigger;
  action?: Action;
  nextNodes: string[];
}

/** A complete automation workflow */
export interface Workflow {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  trigger: Trigger;
  nodes: WorkflowNode[];
}
