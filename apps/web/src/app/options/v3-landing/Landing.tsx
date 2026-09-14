import { prisma } from "@allohq/database";
import { V2Landing } from "../v2/page";
import {
  MAX_COMPARABLE_SUBSCRIBERS,
  MIN_SUBSCRIBERS,
  PRICING_CALCULATOR_DEFAULTS,
  type PricingCalculatorInitialState,
} from "./pricing-calculator-state";
import "./v3-landing.css";

type PalId = "drenched" | "light";

function isPal(value: unknown): value is PalId {
  return value === "drenched" || value === "light";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function boundedParam(value: string | string[] | undefined, fallback: number, min: number, max: number): number {
  const raw = first(value);
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function calculatorState(params: Record<string, string | string[] | undefined>): PricingCalculatorInitialState {
  const currency = first(params.currency) === "USD" ? "USD" : "INR";
  return {
    // Revenue is derived from list size, so no revenue parameter is accepted.
    subscribers: boundedParam(
      params.subs,
      PRICING_CALCULATOR_DEFAULTS.subscribers,
      MIN_SUBSCRIBERS,
      MAX_COMPARABLE_SUBSCRIBERS,
    ),
    emailShare: boundedParam(params.email, PRICING_CALCULATOR_DEFAULTS.emailShare, 5, 40),
    causedShare: boundedParam(params.caused, PRICING_CALCULATOR_DEFAULTS.causedShare, 0, 70),
    blasts: boundedParam(params.blasts, PRICING_CALCULATOR_DEFAULTS.blasts, 0, 31),
    currency,
  };
}

export async function V3Landing({
  searchParams,
  showBanner = true,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
      initialCalculator={calculatorState(params)}
    />
  );
}
