import { prisma } from "@allohq/database";
import { V2Landing } from "../v2/page";
import "./v3-landing.css";

type PalId = "drenched" | "light";

function isPal(value: unknown): value is PalId {
  return value === "drenched" || value === "light";
}

export async function V3Landing({
  searchParams,
  showBanner = true,
}: {
  searchParams: Promise<{ pal?: string | string[] }>;
  showBanner?: boolean;
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
      showBanner={showBanner}
      initialPal={isPal(raw) ? raw : "drenched"}
      enhanced
      crmFormId={crmForm?.id ?? null}
      crmConfigured={Boolean(crmStoreId)}
    />
  );
}
