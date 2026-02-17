import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@allohq/api/src/routers/_app";

/**
 * tRPC React client
 */
export const trpc = createTRPCReact<AppRouter>();
