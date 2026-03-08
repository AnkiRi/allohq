import { router } from "../trpc";
import { healthRouter } from "./health";
import { customersRouter } from "./customers";
import { segmentsRouter } from "./segments";
import { rfmRouter } from "./rfm";
import { storesRouter } from "./stores";
import { dashboardRouter } from "./dashboard";
import { templatesRouter } from "./templates";
import { campaignsRouter } from "./campaigns";
import { productsRouter } from "./products";
import { aiRouter } from "./ai";
import { automationsRouter } from "./automations";
import { autonomyRouter } from "./autonomy";
import { guardrailsRouter } from "./guardrails";

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
  campaigns: campaignsRouter,
  products: productsRouter,
  ai: aiRouter,
  automations: automationsRouter,
  autonomy: autonomyRouter,
  guardrails: guardrailsRouter,
});

export type AppRouter = typeof appRouter;
