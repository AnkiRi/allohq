import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { V2Landing } from "./options/v2/page";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const query = await searchParams;

  // Shopify loads the configured application_url first and supplies the
  // embedded context as query parameters. Preserve that context when entering
  // the dashboard so App Bridge can initialize without a Clerk cookie.
  if (host.startsWith("agent.")) {
    const shop = typeof query.shop === "string" ? query.shop : "";
    const shopifyHost = typeof query.host === "string" ? query.host : "";
    const embedded = query.embedded === "1";
    if (
      embedded &&
      shopifyHost &&
      /^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)
    ) {
      const params = new URLSearchParams({ shop, host: shopifyHost, embedded: "1" });
      redirect(`/dashboard?${params.toString()}`);
    }

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
