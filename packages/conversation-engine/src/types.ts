export interface RoutingDecision {
  handler: "ai" | "merchant";
  reason: string;
  priority: "normal" | "high" | "urgent";
}

export interface ConversationContext {
  customer: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    segment: string | null;
    totalSpent: number;
    orderCount: number;
    churnRisk: number;
    ltv: number;
  } | null;
  state: {
    lifecycleStage: string;
    churnRisk: number;
    trustScore: number;
    supportState: string;
    vipLevel: string;
  } | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    createdAt: Date;
    items: Array<{ title: string; quantity: number; price: number }>;
  }>;
  recentMessages: Array<{ role: string; content: string; createdAt: Date }>;
  supportHistory: { totalConversations: number; resolvedCount: number };
  activeJourneys: Array<{ journeyType: string; currentStep: number; status: string }>;
}

export interface EscalationBrief {
  summary: string;
  customerHistory: string;
  whatWasTried: string[];
  recommendedResolution: string;
}

export interface SentimentResult {
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
}
