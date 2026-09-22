import type { Metadata } from "next";
import { RequestInviteForm } from "@/components/access/RequestInviteForm";

export const metadata: Metadata = {
  title: "Request an invite · Joon",
  description: "Joon is opening with a small number of design partners.",
};

/**
 * The public request-access page.
 *
 * Public by design and creates nothing: submitting writes one access-request
 * row. No identity, no workspace, no membership, no invitation, no store, no
 * model call.
 */
export default function RequestInvitePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <RequestInviteForm />
    </div>
  );
}
