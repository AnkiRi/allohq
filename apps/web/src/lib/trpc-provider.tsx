"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { trpc } from "./trpc";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  // Use a ref so the httpBatchLink headers callback always calls
  // the latest getToken, not a stale one captured in useState.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
          async headers() {
            // Auth status is the source of truth for demo vs real:
            //  • signed IN  → send the Bearer token only. NEVER the demo header,
            //    so an authenticated user is always real (never Vana), even with
            //    a stale demo flag.
            //  • signed OUT → if the demo flag is set, send `x-allo-demo: 1` so
            //    the API serves the read-only Vana demo (resolved as demo-guest).
            let token: string | null = null;
            try {
              token = await getTokenRef.current();
            } catch (err) {
              console.error("[trpc] Clerk getToken error:", err);
            }
            if (token) {
              return { authorization: `Bearer ${token}` };
            }
            if (
              typeof window !== "undefined" &&
              window.localStorage.getItem("allo_demo") === "1"
            ) {
              return { "x-allo-demo": "1" };
            }
            return {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
