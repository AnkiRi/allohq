"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ConsoleFrame } from "@/components/console";
import { CustomerWorkspaceNav } from "@/components/customers/CustomerWorkspaceNav";
import { PageHeader } from "@/components/ui/AppPrimitives";

function nameOf(customer: { firstName: string | null; lastName: string | null; email: string }) {
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email;
}

export default function LeftAlonePage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = (trpc.customers.leftAlone as any).useQuery({
    page,
    limit: 25,
    search: search || undefined,
  }) as {
    data?: {
      customers: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        activeDecisions: Array<{
          reasonText: string | null;
          reconsiderAt: Date | string | null;
        }>;
      }>;
      pages: number;
    };
    isLoading: boolean;
    error: unknown;
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title="Left alone by Joon" description="These are deliberate campaign decisions, not permanent labels. Each customer can return when their evidence, timing or campaign context changes." />
      <CustomerWorkspaceNav />

      <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search customers left alone" className="h-9 w-full rounded-lg border border-border bg-[var(--surface)] pl-9 pr-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>

      <ConsoleFrame title="joon · current restraint decisions">
        {isLoading ? (
          <div className="space-y-3" aria-label="Loading customers">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
            Could not load restraint decisions. Refresh to try again.
          </p>
        ) : !data?.customers.length ? (
          <div className="py-12 text-center">
            <p className="text-sm font-medium text-foreground">
              No customers are currently being deliberately left alone.
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Decisions will appear here after a campaign audience is approved.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.customers.map((customer) => {
              const primary = customer.activeDecisions[0];
              return (
                <Link
                  key={customer.id}
                  href={`/customers/${customer.id}`}
                  className="grid gap-2 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[1.1fr_1.3fr_1fr_auto] sm:items-center sm:px-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{nameOf(customer)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{customer.email}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-foreground">
                      {primary?.reasonText ?? "Current state suggests a different action."}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {customer.activeDecisions.length} active campaign{" "}
                      {customer.activeDecisions.length === 1 ? "policy" : "policies"}
                    </p>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    <span className="block text-foreground">Reconsider</span>
                    {primary?.reconsiderAt
                      ? new Date(primary.reconsiderAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })
                      : "when their state changes"}
                  </div>
                  <ChevronRight
                    className="hidden h-4 w-4 text-muted-foreground sm:block"
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </div>
        )}
      </ConsoleFrame>

      {data && data.pages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Pagination">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
            className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs tabular-nums text-muted-foreground">
            Page {page} of {data.pages}
          </span>
          <button
            type="button"
            disabled={page === data.pages}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </main>
  );
}
