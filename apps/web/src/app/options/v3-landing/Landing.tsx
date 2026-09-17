import { prisma } from "@allohq/database";
import { V2Landing } from "../v2/V2Landing";
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
    subscribers: boundedParam(
      params.subs,
      PRICING_CALCULATOR_DEFAULTS.subscribers,
      MIN_SUBSCRIBERS,
      MAX_COMPARABLE_SUBSCRIBERS,
    ),
    campaigns: boundedParam(params.campaigns, PRICING_CALCULATOR_DEFAULTS.campaigns, 0, 31),
    suppression: boundedParam(params.suppression, PRICING_CALCULATOR_DEFAULTS.suppression, 0, 80),
    control: boundedParam(params.control, PRICING_CALCULATOR_DEFAULTS.control, 0, 30),
    openRate: boundedParam(params.open, PRICING_CALCULATOR_DEFAULTS.openRate, 0, 100),
    clickThroughRate: boundedParam(params.ctr, PRICING_CALCULATOR_DEFAULTS.clickThroughRate, 0, 30),
    conversionRate: boundedParam(params.conversion, PRICING_CALCULATOR_DEFAULTS.conversionRate, 0, 30),
    averageOrderValue: boundedParam(params.aov, currency === "INR" ? 2_000 : 20, 1, 1_000_000),
    sessions: boundedParam(params.sessions, PRICING_CALCULATOR_DEFAULTS.sessions, 0, 10_000_000),
    cartIncidence: boundedParam(params.cart, PRICING_CALCULATOR_DEFAULTS.cartIncidence, 0, 50),
    recoveryRate: boundedParam(params.recovery, PRICING_CALCULATOR_DEFAULTS.recoveryRate, 0, 50),
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
