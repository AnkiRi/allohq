import { InviteAcceptance } from "@/components/invite/InviteAcceptance";

/**
 * Invitation acceptance.
 *
 * The page renders while signed out so Clerk can present sign-in; the token is
 * only redeemed once a session exists, and the API matches it against the
 * caller's VERIFIED email. The token never leaves the URL for the server here —
 * redemption is an authenticated mutation from the client.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <InviteAcceptance token={token} />
    </div>
  );
}
