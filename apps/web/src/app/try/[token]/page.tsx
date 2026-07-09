import { isValidDemoToken } from "@/lib/demoToken";
import { EnterTryDemo } from "./EnterTryDemo";
import { InvalidLink } from "./InvalidLink";

export const metadata = {
  title: "joon · Vana Naturals demo",
  robots: { index: false, follow: false }, // private link — never indexed
};

// Token-gated private demo entry. The token is validated SERVER-SIDE here (and at
// the edge by middleware); a valid token enters the Vana demo, anything else gets
// a clean "invalid link" page — never the real app, never a raw error.
export default async function TryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidDemoToken(token)) {
    return <InvalidLink />;
  }
  return <EnterTryDemo token={token} />;
}
