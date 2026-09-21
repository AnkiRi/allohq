"use client";

import { trpc } from "@/lib/trpc";
import { SignOutButton } from "@clerk/nextjs";

/**
 * What a signed-in person sees when closed beta has withheld a workspace.
 *
 * This is an explanation, not a gate. The gate is server-side: with no
 * workspace, every workspace procedure refuses before a resolver runs, so
 * nothing here — or the absence of it — changes what is reachable. Someone who
 * bypassed this component would still get FORBIDDEN from the API.
 *
 * It deliberately says the same thing to everyone. "We couldn't find an
 * invitation for you" would tell whoever is signed in whether a given address
 * has one.
 */
export function ClosedBetaGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = trpc.invitations.accessState.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  // Never flash the invitation screen at someone who has access. Until the
  // answer is in, the app renders as it always did.
  if (isLoading || !data || data.allowed) return <>{children}</>;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4" data-testid="closed-beta">
      <div className="w-full max-w-md">
        <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
          Closed beta
        </p>
        <h1 className="mt-3 font-serif text-[28px] leading-tight text-foreground">
          Joon is currently available by invitation.
        </h1>
        <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
          We are working with a small number of brands while the control-group
          measurement settles. If someone has invited you, open the link they
          sent and you will land straight in their workspace.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="mailto:hello@joonhq.com?subject=Joon%20access"
            className="rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90"
            data-testid="closed-beta-contact"
          >
            Ask about access
          </a>
          <SignOutButton>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-xs font-sans text-foreground transition-colors hover:border-foreground"
              data-testid="closed-beta-signout"
            >
              Sign out
            </button>
          </SignOutButton>
        </div>
        <p className="mt-6 text-[12px] leading-5 text-muted-foreground">
          Already have access on another account? Sign out and sign back in with
          it.
        </p>
      </div>
    </div>
  );
}
