import { prisma } from "@allohq/database";
import { V2Landing } from "../v2/page";
import {
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
  return {
    subscribers: boundedParam(params.subs, PRICING_CALCULATOR_DEFAULTS.subscribers, 1_000, 1_000_000),
    revenue: boundedParam(params.rev, PRICING_CALCULATOR_DEFAULTS.revenue, 0, 1_000_000_000),
    emailShare: boundedParam(params.email, PRICING_CALCULATOR_DEFAULTS.emailShare, 5, 40),
    causedShare: boundedParam(params.caused, PRICING_CALCULATOR_DEFAULTS.causedShare, 0, 70),
    blasts: boundedParam(params.blasts, PRICING_CALCULATOR_DEFAULTS.blasts, 0, 31),
    currency: first(params.currency) === "USD" ? "USD" : "INR",
    tool: first(params.tool) === "entered_bill" ? "entered_bill" : "shopify_email",
    enteredBill: boundedParam(params.bill, PRICING_CALCULATOR_DEFAULTS.enteredBill, 0, 100_000_000),
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
