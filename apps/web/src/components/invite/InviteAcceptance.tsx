"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, SignOutButton, SignUpButton } from "@clerk/nextjs";
import { trpc } from "@/lib/trpc";

/**
 * Redeem an invitation.
 *
 * Signed out, this offers sign-in and sign-up and nothing else — the token is
 * not sent anywhere until there is an identity to match it against.
 *
 * Signed in, the server is asked what this invitation means for *this* account
 * before anything is offered. The earlier version said "you have been invited"
 * to whoever was signed in, and only told them they were the wrong person after
 * they clicked accept. Now a mismatch is stated up front, with the way out.
 *
 * The invited address is never shown. Someone holding a forwarded link would
 * otherwise learn who it was meant for. "A different address" is all anyone
 * needs to know.
 */
export function InviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  // Authentication returns here, token and all, so the invitation survives it.
  const here = `/invite/${token}`;
  const [failed, setFailed] = React.useState(false);

  const check = trpc.invitations.checkForCurrentUser.useQuery(
    { token },
    { retry: false, refetchOnWindowFocus: false }
  );
  const accept = trpc.invitations.accept.useMutation({
    onSuccess: () => router.push("/dashboard"),
    onError: () => setFailed(true),
  });

  return (
    <div className="w-full max-w-md" data-testid="invite-acceptance">
      <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
        Closed beta
      </p>

      <SignedOut>
        <h1 className="mt-3 font-serif text-[28px] leading-tight text-foreground">
          You have been invited to Joon.
        </h1>
        <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
          Use the address this invitation was sent to. If you already have a
          Joon account, sign in; if not, create one with that address.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <SignInButton mode="modal" forceRedirectUrl={here} signUpForceRedirectUrl={here}>
            <button
              type="button"
              className="rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90"
              data-testid="invite-sign-in"
            >
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal" forceRedirectUrl={here} signInForceRedirectUrl={here}>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-xs font-sans text-foreground transition-colors hover:border-foreground"
              data-testid="invite-sign-up"
            >
              Create an account
            </button>
          </SignUpButton>
        </div>
      </SignedOut>

      <SignedIn>
        {check.isLoading && (
          <p className="mt-6 text-[14px] text-muted-foreground">Checking your invitation…</p>
        )}

        {check.data?.state === "ready" && !failed && (
          <>
            <h1 className="mt-3 font-serif text-[28px] leading-tight text-foreground">
              You have been invited to Joon.
            </h1>
            <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
              Accepting adds this account to the workspace you were invited to.
              An invitation can be used once.
            </p>
            <div className="mt-8">
              <button
                type="button"
                onClick={() => accept.mutate({ token })}
                disabled={accept.isPending}
                className="rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
                data-testid="invite-accept"
              >
                {accept.isPending ? "Accepting…" : "Accept invitation"}
              </button>
            </div>
          </>
        )}

        {check.data?.state === "wrong_account" && (
          <>
            <h1 className="mt-3 font-serif text-[28px] leading-tight text-foreground">
              This invitation is for a different account.
            </h1>
            <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
              It was sent to a specific email address, and the account you are
              signed in with is not it. Sign out and sign back in with the
              address the invitation was sent to.
            </p>
            <div className="mt-8">
              {/* Back to this page afterwards, so the invitation is still here. */}
              <SignOutButton redirectUrl={here}>
                <button
                  type="button"
                  className="rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90"
                  data-testid="invite-switch-account"
                >
                  Use a different account
                </button>
              </SignOutButton>
            </div>
          </>
        )}

        {(check.data?.state === "unusable" || failed) && (
          <>
            <h1 className="mt-3 font-serif text-[28px] leading-tight text-foreground">
              That invitation can&rsquo;t be used.
            </h1>
            <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
              It may have been used already, withdrawn, or have expired. Ask
              whoever invited you for a new link.
            </p>
            <div className="mt-8">
              <SignOutButton redirectUrl={here}>
                <button
                  type="button"
                  className="rounded-lg border border-border px-4 py-2 text-xs font-sans text-foreground transition-colors hover:border-foreground"
                  data-testid="invite-switch-account"
                >
                  Use a different account
                </button>
              </SignOutButton>
            </div>
          </>
        )}
      </SignedIn>
    </div>
  );
}
