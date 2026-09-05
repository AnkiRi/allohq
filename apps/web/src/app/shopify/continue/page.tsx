"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth, SignInButton, SignUpButton } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ShopifyContinuePage() {
  return (
    <Suspense fallback={<HandoffLoading />}>
      <ShopifyContinue />
    </Suspense>
  );
}

function HandoffLoading() {
  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground">
      <div className="text-center">
        <Loader2 className="mx-auto size-5 animate-spin" />
        <p className="mt-3 text-sm text-muted-foreground">Preparing your secure handoff…</p>
      </div>
    </main>
  );
}

function ShopifyContinue() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const handoff = params.get("token");
    if (!handoff) {
      setError("This Shopify handoff link is incomplete.");
      return;
    }
    void (async () => {
      try {
        const clerkToken = await getToken();
        if (!clerkToken) throw new Error("Joon could not verify your account");
        const apiOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const response = await fetch(`${apiOrigin}/v1/shopify/handoff/redeem`, {
          method: "POST",
          headers: { Authorization: `Bearer ${clerkToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ token: handoff }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Joon could not link this store");
        router.replace("/dashboard");
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Joon could not link this store");
      }
    })();
  }, [getToken, isLoaded, isSignedIn, params, router]);

  if (!isLoaded || isSignedIn)
    return (
      <main className="min-h-screen grid place-items-center bg-background text-foreground">
        <div className="text-center">
          <Loader2 className="mx-auto size-5 animate-spin" />
          <p className="mt-3 text-sm text-muted-foreground">Securely linking your Shopify store…</p>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </main>
    );

  return (
    <main className="min-h-screen grid place-items-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md border-y border-border py-10">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Connect your Joon account</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Shopify has verified your store and staff session. Sign in or create an account to open
          the full workspace.
        </p>
        <div className="mt-6 flex gap-3">
          <SignUpButton mode="modal">
            <button className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
              Create account
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>
    </main>
  );
}
