import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { V2Landing } from "./options/v2/page";

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // agent.joonhq.ai — skip landing, go straight to app (unchanged)
  if (host.startsWith("agent.")) {
    const { userId } = await auth();
    if (userId) {
      redirect("/dashboard");
    } else {
      redirect("/sign-in");
    }
  }

  // Production landing = the locked V2 design (default palette: drenched).
  // No prototype banner; the visitor-facing palette switcher still renders.
  return <V2Landing showBanner={false} />;
}
