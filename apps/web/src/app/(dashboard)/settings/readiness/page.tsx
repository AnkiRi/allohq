"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { LaunchReadinessPanel } from "@/components/onboarding/OnboardingWizard";
import { trpc } from "@/lib/trpc";

export default function SetupReadinessPage() {
  const { data: stores, isLoading } = trpc.stores.list.useQuery();
  const storeId = stores?.[0]?.id;

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>;
  }

  if (!storeId) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <h1 className="text-2xl font-semibold">Connect a store first</h1>
        <p className="mt-2 text-sm text-muted-foreground">Setup readiness becomes available after Shopify is connected.</p>
        <Link href="/dashboard" className="mt-5 inline-flex text-sm font-medium text-decision">Return to home</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-4 sm:py-8">
      <LaunchReadinessPanel storeId={storeId} />
      <div className="mt-6"><Link href="/dashboard" className="text-sm font-medium text-decision">← Return to dashboard</Link></div>
    </div>
  );
}
