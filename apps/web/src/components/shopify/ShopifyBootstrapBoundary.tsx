"use client";

import { useCallback, useEffect, useState } from "react";
import { getShopifyIdToken, isEmbeddedShopifyApp } from "@/lib/shopify-app-bridge";
import { ArrowUpRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

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
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          missingScopes?: string[];
        } | null;
        const missing = body?.missingScopes?.length
          ? ` Missing: ${body.missingScopes.join(", ")}.`
          : "";
        throw new Error(
          `${body?.error || `Installation bootstrap returned ${response.status}`}.${missing}`
        );
      }
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

  if (state === "ready") {
    return isEmbeddedShopifyApp() ? <EmbeddedShopifyHome /> : <>{children}</>;
  }
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

function EmbeddedShopifyHome() {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openWorkspace() {
    setOpening(true);
    setError("");
    // Open synchronously so browser popup protection does not discard the tab
    // while the signed handoff is being requested.
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;
    try {
      const idToken = await getShopifyIdToken();
      if (!idToken) throw new Error("Shopify did not provide a fresh identity token");
      const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${apiOrigin}/v1/shopify/handoff`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const result = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !result.token) throw new Error(result.error || "Could not open Joon");
      const destination = `${window.location.origin}/shopify/continue?token=${encodeURIComponent(result.token)}`;
      if (target) target.location.href = destination;
      else window.location.href = destination;
    } catch (reason) {
      target?.close();
      setError(reason instanceof Error ? reason.message : "Could not open Joon");
    } finally {
      setOpening(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-3xl py-10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <CheckCircle2 className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Joon is connected</h1>
            <p className="text-sm text-muted-foreground">Your Shopify session is verified.</p>
          </div>
        </div>
        <div className="mt-10 border-y border-border py-8">
          <h2 className="max-w-xl text-2xl font-semibold tracking-[-0.02em] text-balance">
            Give campaigns, journeys and email design the space they need.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Joon uses Shopify for installation and store identity, then opens the complete workspace
            in its own secure tab. You will link or sign in to your Joon account once.
          </p>
          <button
            type="button"
            onClick={openWorkspace}
            disabled={opening}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {opening ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUpRight className="size-4" />
            )}{" "}
            Open Joon workspace
          </button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" /> The link expires in five minutes and works once.
        </p>
      </div>
    </main>
  );
}
