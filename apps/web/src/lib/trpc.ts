import { type CreateTRPCReact, createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@allohq/api/src/routers/_app";

/**
 * tRPC React client — explicit type annotation avoids TS2742 with pnpm workspace
 */
export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
