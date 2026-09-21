import Link from "next/link";
import { SignUp } from "@clerk/nextjs";

/**
 * Sign-up during closed beta.
 *
 * `INVITE_ONLY_MODE` is read here on the server, so the Clerk sign-up component
 * is not rendered at all rather than hidden. That is still only presentation:
 * the account is created by Clerk, and Clerk's own dashboard must be set to
 * restrict sign-ups as well — see the deployment checklist. What actually
 * withholds access is that no workspace is provisioned server-side, which no
 * amount of reaching Clerk directly can change.
 */
export default function SignUpPage() {
  const inviteOnly = (process.env["INVITE_ONLY_MODE"] ?? "").trim().toLowerCase() === "true";

  if (!inviteOnly) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <SignUp />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md" data-testid="sign-up-invite-only">
        <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
          Closed beta
        </p>
        <h1 className="mt-3 font-serif text-[28px] leading-tight text-foreground">
          Joon is currently available by invitation.
        </h1>
        <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
          We are working with a small number of brands while the control-group
          measurement settles. If you have an invitation link, open it and it
          will take you through sign-in.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90"
          >
            Sign in
          </Link>
          <a
            href="mailto:hello@joonhq.com?subject=Joon%20access"
            className="rounded-lg border border-border px-4 py-2 text-xs font-sans text-foreground transition-colors hover:border-foreground"
          >
            Ask about access
          </a>
        </div>
      </div>
    </div>
  );
}
