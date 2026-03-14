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
            try {
              const token = await getTokenRef.current();
              if (token) {
                return { authorization: `Bearer ${token}` };
              }
              console.warn("[trpc] No token from Clerk getToken()");
            } catch (err) {
              console.error("[trpc] Clerk getToken error:", err);
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
