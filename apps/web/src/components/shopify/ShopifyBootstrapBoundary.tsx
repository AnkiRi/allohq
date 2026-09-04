"use client";

import { useCallback, useEffect, useState } from "react";
import { getShopifyIdToken, isEmbeddedShopifyApp } from "@/lib/shopify-app-bridge";

type State = "checking" | "ready" | "failed";

export function ShopifyBootstrapBoundary({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");

  const bootstrap = useCallback(async () => {
    if (!isEmbeddedShopifyApp()) {
      setState("ready");
      return;
    }

    setState("checking");
    setError("");
    try {
      const idToken = await getShopifyIdToken();
      if (!idToken) throw new Error("Shopify did not provide an identity token");
      const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${apiOrigin}/v1/shopify/bootstrap`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw new Error(`Installation bootstrap returned ${response.status}`);
      setState("ready");
    } catch (reason) {
      console.error("[shopify] Installation bootstrap failed", reason);
      setError(reason instanceof Error ? reason.message : "Installation bootstrap failed");
      setState("failed");
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (state === "ready") return <>{children}</>;
  if (state === "failed") {
    return (
      <main className="min-h-screen grid place-items-center bg-background p-6 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Joon couldn&apos;t finish connecting this store</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => void bootstrap()}
            className="mt-5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground">
      Connecting Joon to Shopify…
    </main>
  );
}
