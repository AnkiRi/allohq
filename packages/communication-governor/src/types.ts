export interface GovernorDecision {
  allowed: boolean;
  reason?: string;
  rule?: string;
  delayUntil?: Date;
}

export interface FatigueConfig {
  email: { weeklyMax: number; monthlyMax: number };
  sms: { weeklyMax: number; monthlyMax: number };
  whatsapp: { weeklyMax: number; monthlyMax: number };
  rcs: { weeklyMax: number; monthlyMax: number };
}

export interface QuietHoursConfig {
  startHour: number; // 0-23
  endHour: number; // 0-23
  timezone: string;
}

export interface GovernorCheckParams {
  customerId: string;
  storeId: string;
  channel: string;
  messageType: string; // campaign, automation, transactional
  campaignId?: string;
}

export const DEFAULT_FATIGUE_CONFIG: FatigueConfig = {
  email: { weeklyMax: 3, monthlyMax: 10 },
  sms: { weeklyMax: 2, monthlyMax: 6 },
  whatsapp: { weeklyMax: 1, monthlyMax: 4 },
  rcs: { weeklyMax: 2, monthlyMax: 6 },
};

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  startHour: 22,
  endHour: 7,
  timezone: "UTC",
};
