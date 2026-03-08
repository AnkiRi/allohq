export enum LifecycleStage {
  VISITOR = "visitor",
  SUBSCRIBER = "subscriber",
  FIRST_BUYER = "first_buyer",
  REPEAT = "repeat",
  LOYAL = "loyal",
  CHAMPION = "champion",
  AT_RISK = "at_risk",
  LOST = "lost",
}

export enum IntentState {
  BROWSING = "browsing",
  CONSIDERING = "considering",
  READY_TO_BUY = "ready_to_buy",
  NEEDS_HELP = "needs_help",
  INACTIVE = "inactive",
}

export enum SupportState {
  CLEAR = "clear",
  OPEN_ISSUE = "open_issue",
  RECENT_COMPLAINT = "recent_complaint",
  ESCALATED = "escalated",
}

export enum VipLevel {
  STANDARD = "standard",
  SILVER = "silver",
  GOLD = "gold",
  PLATINUM = "platinum",
}

export interface ChannelPreference {
  email: number;
  whatsapp: number;
  sms: number;
  rcs: number;
}

export interface SendWindow {
  timezone: string;
  bestHours: number[];
}

export interface FatigueChannelState {
  lastSent: string | null; // ISO date string
  countThisWeek: number;
  countThisMonth: number;
}

export type FatigueState = Record<string, FatigueChannelState>;

export interface CustomerStateData {
  customerId: string;
  storeId: string;
  lifecycleStage: LifecycleStage;
  churnRisk: number;
  intentState: IntentState;
  channelPreference: ChannelPreference;
  optimalSendWindow: SendWindow;
  communicationFatigue: FatigueState;
  discountSensitivity: number;
  supportState: SupportState;
  trustScore: number;
  vipLevel: VipLevel;
  campaignEligibility: string[];
  lastStateUpdate: Date;
}

export interface StateUpdateEvent {
  type:
    | "order_created"
    | "email_opened"
    | "email_clicked"
    | "email_sent"
    | "sms_sent"
    | "whatsapp_sent"
    | "rcs_sent"
    | "support_opened"
    | "support_resolved"
    | "segment_changed"
    | "full_recalculation";
  customerId: string;
  storeId: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export interface ReorderPrediction {
  expectedDays: number;
  confidence: number;
  nextExpectedDate: Date | null;
}
