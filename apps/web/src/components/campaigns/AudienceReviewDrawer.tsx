"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type AudienceReason =
  | "deliberately_left_alone"
  | "recent_purchase"
  | "fatigue"
  | "collision"
  | "cooldown"
  | "support_state"
  | "no_consent"
  | "unsubscribed"
  | "complaint"
  | "hard_bounce"
  | "invalid_email"
  | "manual_suppression"
  | "already_processed";

export interface AudienceReviewGroup {
  reason: AudienceReason;
  label: string;
  count: number;
  explanation: string;
}

const PAGE_SIZE = 25;

function humanState(customer: any) {
  const parts = [
    customer.lifecycle?.replaceAll("_", " "),
    customer.purchaseCyclePosition && `${customer.purchaseCyclePosition.replaceAll("_", " ")} in purchase cycle`,
    customer.discountBehavior?.replaceAll("_", " "),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not enough customer history yet";
}

export function AudienceReviewDrawer({
  campaignId,
  groups,
}: {
  campaignId: string;
  groups: AudienceReviewGroup[];
}) {
  const visibleGroups = useMemo(() => groups.filter((group) => group.count > 0), [groups]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AudienceReason>(visibleGroups[0]?.reason ?? "deliberately_left_alone");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => setPage(1), [reason, debouncedQuery]);
  useEffect(() => {
    if (!visibleGroups.some((group) => group.reason === reason) && visibleGroups[0]) {
      setReason(visibleGroups[0].reason);
    }
  }, [reason, visibleGroups]);

  const review = (trpc.campaigns.audienceReview as any).useQuery(
    { id: campaignId, reason, query: debouncedQuery, page, pageSize: PAGE_SIZE },
    { enabled: open },
  );
  const activeGroup = visibleGroups.find((group) => group.reason === reason);

  if (visibleGroups.length === 0) return null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Review everyone left out
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col border-l border-border bg-background shadow-[-16px_0_48px_rgba(0,0,0,0.16)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right motion-reduce:animate-none">
          <header className="flex items-start justify-between gap-6 border-b border-border px-5 py-5 sm:px-7">
            <div>
              <Dialog.Title className="font-serif text-xl font-semibold tracking-[-0.02em] text-foreground">
                Audience review
              </Dialog.Title>
              <Dialog.Description className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-foreground">
                See every customer who will not receive this campaign, the rule behind that decision and when Joon will reconsider it.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Close audience review</span>
            </Dialog.Close>
          </header>

          <div className="grid min-h-0 flex-1 md:grid-cols-[220px_minmax(0,1fr)]">
            <nav className="border-b border-border p-3 md:border-b-0 md:border-r" aria-label="Audience decision reasons">
              <div className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible">
                {visibleGroups.map((group) => (
                  <button
                    key={group.reason}
                    type="button"
                    onClick={() => setReason(group.reason)}
                    className={`flex min-w-max items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-[11px] transition-colors md:w-full ${
                      reason === group.reason
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>{group.label}</span>
                    <span className="font-mono tabular-nums">{group.count.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </nav>

            <section className="flex min-h-0 flex-col">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-semibold text-foreground">{activeGroup?.label}</h3>
                    <p className="mt-1 max-w-xl text-[11px] leading-5 text-muted-foreground">
                      {activeGroup?.explanation}
                    </p>
                  </div>
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">
                    {(review.data?.total ?? activeGroup?.count ?? 0).toLocaleString()} customers
                  </span>
                </div>
                <label className="relative mt-4 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">Search customers</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by customer name or email"
                    className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 sm:px-6">
                {review.isLoading ? (
                  <div className="py-12 text-center text-[12px] text-muted-foreground">Loading the audience decision…</div>
                ) : review.error ? (
                  <div className="py-12 text-center text-[12px] text-[var(--color-urgent)]">
                    We couldn&apos;t load this audience group. Close the review and try again.
                  </div>
                ) : review.data?.customers.length ? (
                  <div className="divide-y divide-border">
                    {review.data.customers.map((customer: any) => {
                      const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email;
                      return (
                        <article key={customer.id} className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="truncate text-[12px] font-semibold text-foreground">{name}</div>
                              {name !== customer.email && <div className="truncate text-[10px] text-muted-foreground">{customer.email}</div>}
                            </div>
                            {customer.nextEvaluationAt && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                Review {new Date(customer.nextEvaluationAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-[11px] capitalize text-foreground">{humanState(customer)}</p>
                          {customer.evidence && <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{customer.evidence}</p>}
                          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                            Re-enters consideration: {review.data.reconsideration}.
                          </p>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-[12px] text-muted-foreground">
                    No customers match this search.
                  </div>
                )}
              </div>

              <footer className="flex items-center justify-between gap-4 border-t border-border px-5 py-4 sm:px-6">
                <p className="text-[10px] text-muted-foreground">
                  Page {review.data?.page ?? page} of {review.data?.pageCount ?? 1}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={(review.data?.page ?? page) <= 1}
                    className="rounded-lg border border-border p-2 text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Previous page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((value) => value + 1)}
                    disabled={(review.data?.page ?? page) >= (review.data?.pageCount ?? 1)}
                    className="rounded-lg border border-border p-2 text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Next page</span>
                  </button>
                </div>
              </footer>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
