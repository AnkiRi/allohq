import { router } from "../trpc";
import { healthRouter } from "./health";
import { customersRouter } from "./customers";
import { segmentsRouter } from "./segments";
import { rfmRouter } from "./rfm";

/**
 * Root tRPC router
 */
export const appRouter = router({
  health: healthRouter,
  customers: customersRouter,
  segments: segmentsRouter,
  rfm: rfmRouter,
});

export type AppRouter = typeof appRouter;
