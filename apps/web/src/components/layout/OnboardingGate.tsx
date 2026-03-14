"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

/**
 * Routes allowed before onboarding is complete.
 */
const ALLOWED_ROUTES = [
  "/dashboard",
  "/integrations",
  "/onboarding",
  "/settings",
];

function isAllowed(pathname: string) {
  return ALLOWED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const { data: stores, isLoading } = trpc.stores.list.useQuery();
  const store = stores?.[0];
  const hasStore = !!store;
  const onboardingDone = !!store?.onboardingCompletedAt;

  useEffect(() => {
    if (isLoading) return;

    // No store → allow dashboard so they can connect
    if (!hasStore) return;

    // Store exists but onboarding not done → redirect to /onboarding
    if (!onboardingDone && !isAllowed(pathname)) {
      router.replace("/onboarding");
    }
  }, [isLoading, hasStore, onboardingDone, pathname, router]);

  return <>{children}</>;
}
