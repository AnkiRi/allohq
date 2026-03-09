import type { Channel } from "@allohq/messaging";

export type JourneyType =
  | "welcome"
  | "winback"
  | "repurchase"
  | "post_purchase"
  | "cross_sell"
  | "re_engagement";

export type JourneyStatus =
  | "active"
  | "completed"
  | "suppressed"
  | "paused"
  | "expired";

export type ABTestVariable =
  | "subject_line"
  | "send_time"
  | "content"
  | "channel"
  | "template";

export interface JourneyStep {
  step: number;
  channel: Channel;
  templateId?: string;
  sentAt?: string; // ISO date
  opened?: boolean;
  clicked?: boolean;
  converted?: boolean;
  messageLogId?: string;
  variant?: string; // "a" or "b" for A/B tests
  suppressedReason?: string;
}

export interface JourneyDecision {
  channel: Channel;
  sendAt: Date;
  tone: ToneStyle;
  templateId?: string;
  abTestId?: string;
  variant?: "a" | "b";
}

export type ToneStyle =
  | "educational"
  | "friendly"
  | "insider"
  | "exclusive"
  | "urgent"
  | "casual";

export interface ChannelSelection {
  channel: Channel;
  score: number;
  reason: string;
  allowed: boolean;
}

export interface ABTestResult {
  variant: "a" | "b";
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  revenue: number;
}

export interface ABTestEvaluation {
  testId: string;
  winner: "a" | "b" | null;
  confidence: number;
  aResults: ABTestResult;
  bResults: ABTestResult;
  ready: boolean; // has enough samples
}

export interface JourneyStepInput {
  journeyId: string;
  customerId: string;
  storeId: string;
  automationId?: string;
  stepIndex: number;
  nodes: WorkflowNode[];
}

export interface WorkflowNode {
  id: string;
  type:
    | "send_email"
    | "send_sms"
    | "send_whatsapp"
    | "send_rcs"
    | "wait"
    | "condition"
    | "channel_select"
    | "ab_test"
    | "silence_check"
    | "recommend_products";
  config: Record<string, unknown>;
}
