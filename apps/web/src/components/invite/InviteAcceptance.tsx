"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { trpc } from "@/lib/trpc";

/**
 * Redeem an invitation.
 *
 * Signed out, this offers sign-in and nothing else — the token is not sent
 * anywhere until there is an identity to match it against. Signed in, one
 * mutation redeems it; the server checks expiry, revocation, single use, and
 * that the caller's verified email is the one the invitation was issued to.
 *
 * Every failure reads the same. Distinguishing "expired" from "not yours"
 * would tell whoever holds a token something about the person it was for.
 */
export function InviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const accept = trpc.invitations.accept.useMutation({
    onSuccess: () => router.push("/dashboard"),
    onError: () => setError("That invitation can't be used."),
  });

  return (
    <div className="w-full max-w-md" data-testid="invite-acceptance">
      <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
        Closed beta
      </p>
      <h1 className="mt-3 font-serif text-[28px] leading-tight text-foreground">
        You have been invited to Joon.
      </h1>

      <SignedOut>
        <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
          Sign in with the address this invitation was sent to, and it will take
          you into the workspace.
        </p>
        <div className="mt-8">
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90"
              data-testid="invite-sign-in"
            >
              Sign in to continue
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
          Accepting will add you to the workspace you were invited to. An
          invitation can be used once.
        </p>
        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              setError(null);
              accept.mutate({ token });
            }}
            disabled={accept.isPending}
            className="rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
            data-testid="invite-accept"
          >
            {accept.isPending ? "Accepting…" : "Accept invitation"}
          </button>
        </div>
        {error && (
          <p className="mt-4 text-[13px] leading-5 text-[var(--risk)]" data-testid="invite-error">
            {error} If you think it should, check you are signed in with the
            address it was sent to.
          </p>
        )}
      </SignedIn>
    </div>
  );
}
