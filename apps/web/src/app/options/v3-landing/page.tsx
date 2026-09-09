import type { Metadata } from "next";
import { prisma } from "@allohq/database";
import { V2Landing } from "../v2/page";
import "../v2/v2.css";
import "./v3-landing.css";

export const metadata: Metadata = {
  title: "joon · the email tool that gets paid to send less",
  description:
    "Joon helps Shopify brands send fewer, better emails, with merchant approval and a measurable control.",
};

type PalId = "drenched" | "light";
function isPal(value: unknown): value is PalId {
  return value === "drenched" || value === "light";
}

export default async function V3LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ pal?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.pal) ? params.pal[0] : params.pal;
  const crmStoreId = process.env.JOON_CRM_STORE_ID?.trim();
  const crmForm = crmStoreId
    ? await prisma.form.findFirst({
        where: { storeId: crmStoreId, status: "active" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })
    : null;
  return (
    <V2Landing
      showBanner
      initialPal={isPal(raw) ? raw : "drenched"}
      enhanced
      crmFormId={crmForm?.id ?? null}
      crmConfigured={Boolean(crmStoreId)}
    />
  );
}
