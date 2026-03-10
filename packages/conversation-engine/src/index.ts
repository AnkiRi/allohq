// Types
export type {
  RoutingDecision,
  ConversationContext,
  EscalationBrief,
  SentimentResult,
} from "./types";

// Router
export { routeConversation } from "./conversation-router";

// Context
export { buildConversationContext } from "./context-builder";

// Response
export { generateResponse } from "./response-generator";

// Escalation
export { buildEscalationBrief, escalateConversation } from "./escalation-engine";

// Support-Marketing Bridge
export {
  onConversationOpened,
  onConversationResolved,
  classifySentiment,
} from "./support-marketing-bridge";

// Knowledge Base
export {
  createArticle,
  updateArticle,
  deleteArticle,
  listArticles,
  searchKnowledge,
} from "./knowledge-base";
