import { router } from "../trpc";
import { healthRouter } from "./health";
import { customersRouter } from "./customers";
import { segmentsRouter } from "./segments";
import { rfmRouter } from "./rfm";
import { storesRouter } from "./stores";
import { dashboardRouter } from "./dashboard";
import { templatesRouter } from "./templates";
import { emailsRouter } from "./emails";
import { campaignsRouter } from "./campaigns";
import { productsRouter } from "./products";
import { aiRouter } from "./ai";
import { automationsRouter } from "./automations";
import { autonomyRouter } from "./autonomy";
import { guardrailsRouter } from "./guardrails";
import { briefingsRouter } from "./briefings";
import { formsRouter } from "./forms";
import { analyticsRouter } from "./analytics";
import { recommendationsRouter } from "./recommendations";
import { knowledgeRouter } from "./knowledge";
import { onboardingRouter } from "./onboarding";
import { notificationsRouter } from "./notifications";
import { conversationsRouter } from "./conversations";
import { eventsRouter } from "./events";
import { activityRouter } from "./activity";
import { senderDomainsRouter } from "./sender-domains";

/**
 * Root tRPC router
 */
export const appRouter = router({
  health: healthRouter,
  customers: customersRouter,
  segments: segmentsRouter,
  rfm: rfmRouter,
  stores: storesRouter,
  dashboard: dashboardRouter,
  templates: templatesRouter,
  emails: emailsRouter,
  campaigns: campaignsRouter,
  products: productsRouter,
  ai: aiRouter,
  automations: automationsRouter,
  autonomy: autonomyRouter,
  guardrails: guardrailsRouter,
  briefings: briefingsRouter,
  forms: formsRouter,
  analytics: analyticsRouter,
  recommendations: recommendationsRouter,
  knowledge: knowledgeRouter,
  onboarding: onboardingRouter,
  notifications: notificationsRouter,
  conversations: conversationsRouter,
  events: eventsRouter,
  activity: activityRouter,
  senderDomains: senderDomainsRouter,
});

export type AppRouter = typeof appRouter;
