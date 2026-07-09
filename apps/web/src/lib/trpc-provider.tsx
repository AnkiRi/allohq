"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { trpc } from "./trpc";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  // Use refs so the httpBatchLink headers callback always sees the LATEST auth
  // state, not values captured in useState at client-creation time.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;

  // A signed-in user is ALWAYS a real user — never the demo. Clear any stale
  // demo flag left over from a prior /try visit so it can't leak into a real
  // session (and so a transient null token can't fall back to Vana).
  useEffect(() => {
    if (isSignedIn && typeof window !== "undefined") {
      window.localStorage.removeItem("allo_demo");
    }
  }, [isSignedIn]);

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
            // NEVER fall back to the demo header for a signed-in user — a
            // transient null token must surface as auth-required (recoverable),
            // not silently serve the Vana demo store to a real account.
            if (
              !isSignedInRef.current &&
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
