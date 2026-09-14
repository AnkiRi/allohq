"use client";

import { computeAttributedFunnelScenario, KLAVIYO_EMAIL_USD_EVIDENCE, type Currency } from "@allohq/pricing";
import { useEffect, useId, useMemo, useState } from "react";
import { MAX_COMPARABLE_SUBSCRIBERS, MIN_SUBSCRIBERS, PRICING_CALCULATOR_DEFAULTS, type PricingCalculatorInitialState } from "./pricing-calculator-state";

function money(minor: number, currency: Currency) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}
function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}
function recordLandingEvent(event: string) {
  const body = JSON.stringify({ event });
  if (navigator.sendBeacon?.("/api/public/landing-events", new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/public/landing-events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
}

export function PricingCalculator({ initial = PRICING_CALCULATOR_DEFAULTS }: { initial?: PricingCalculatorInitialState }) {
  const [values, setValues] = useState(initial);
  const [copied, setCopied] = useState(false);
  const set = <K extends keyof PricingCalculatorInitialState>(key: K, value: PricingCalculatorInitialState[K]) => setValues((current) => ({ ...current, [key]: value }));
  const scenario = useMemo(() => computeAttributedFunnelScenario({
    activeSubscribers: values.subscribers,
    campaignsPerMonth: values.campaigns,
    suppressionBasisPoints: values.suppression * 100,
    controlBasisPoints: values.control * 100,
    openRateBasisPoints: values.openRate * 100,
    clickThroughRateBasisPoints: values.clickThroughRate * 100,
    conversionRateBasisPoints: values.conversionRate * 100,
    averageOrderValueMinor: values.averageOrderValue * 100,
    monthlySessions: values.sessions,
    abandonedCartIncidenceBasisPoints: values.cartIncidence * 100,
    abandonedCartRecoveryBasisPoints: values.recoveryRate * 100,
    currency: values.currency,
    subscriberSnapshotAt: "illustrative-calculator",
    comparisonEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
  }), [values]);

  useEffect(() => recordLandingEvent("landing_view"), []);
  useEffect(() => {
    const query = new URLSearchParams(Object.entries({ subs: values.subscribers, campaigns: values.campaigns, suppression: values.suppression, control: values.control, open: values.openRate, ctr: values.clickThroughRate, conversion: values.conversionRate, aov: values.averageOrderValue, sessions: values.sessions, cart: values.cartIncidence, recovery: values.recoveryRate, currency: values.currency }).map(([key, value]) => [key, String(value)]));
    window.history.replaceState(null, "", `${window.location.pathname}?${query}${window.location.hash}`);
  }, [values]);

  const incumbent = scenario.traditional?.priceMinor ?? null;
  const saving = incumbent === null ? null : incumbent - scenario.invoice.totalMinor;
  const treatmentShare = Math.round((1 - values.suppression / 100) * (1 - values.control / 100) * 100);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); recordLandingEvent("share_link_copied"); window.setTimeout(() => setCopied(false), 2_000); } catch { setCopied(false); }
  };

  return <div className="v3-calc" aria-label="Illustrative Joon pricing calculator">
    <div className="v3-calc__banner mono">Free during early access. This models the 5% fee after early access.</div>
    <div className="v3-calc__inputs" onInput={() => recordLandingEvent("calculator_interacted")}>
      <LogSubscribers value={values.subscribers} set={(value) => set("subscribers", value)} />
      <NumberRange label="Campaigns each month" value={values.campaigns} min={0} max={16} set={(value) => set("campaigns", value)} />
      <NumberRange label="Deliberately left alone" value={values.suppression} min={0} max={60} suffix="%" set={(value) => set("suppression", value)} helper="State-based decisions: regular full-price buyers, recent purchasers, fatigue and poor offer fit." />
      <NumberRange label="Random control group" value={values.control} min={0} max={30} suffix="%" set={(value) => set("control", value)} helper="A rotating sample of campaign candidates, used for proof—not billing." />
      <NumberRange label="Open rate" value={values.openRate} min={0} max={80} suffix="%" set={(value) => set("openRate", value)} helper="Shown for context. Click-through below is measured from delivered emails." />
      <NumberRange label="Click-through rate" value={values.clickThroughRate} min={0} max={20} suffix="%" set={(value) => set("clickThroughRate", value)} />
      <NumberRange label="Click-to-order conversion" value={values.conversionRate} min={0} max={30} suffix="%" set={(value) => set("conversionRate", value)} />
      <EditableField label="Average order value" value={values.averageOrderValue} min={1} max={1_000_000} prefix={values.currency === "INR" ? "₹" : "$"} set={(value) => set("averageOrderValue", value)} />
      <EditableField label="Monthly store sessions" value={values.sessions} min={0} max={10_000_000} set={(value) => set("sessions", value)} />
      <NumberRange label="Sessions becoming abandoned carts" value={values.cartIncidence} min={0} max={30} suffix="%" set={(value) => set("cartIncidence", value)} />
      <NumberRange label="Abandoned carts recovered" value={values.recoveryRate} min={0} max={30} suffix="%" set={(value) => set("recoveryRate", value)} />
      <div className="v3-calc__field"><label htmlFor="pricing-currency">Currency</label><select id="pricing-currency" value={values.currency} onChange={(event) => set("currency", event.target.value as Currency)}><option>INR</option><option>USD</option></select></div>
    </div>
    <div className="v3-calc__flow" aria-live="polite">
      <span><b>{scenario.traditionalDelivered.toLocaleString("en-IN")}</b> blast-tool deliveries</span><i>→</i>
      <span><b>{scenario.deliberatelyLeftAlone.toLocaleString("en-IN")}</b> deliberately left alone</span><i>→</i>
      <span><b>{scenario.controlCount.toLocaleString("en-IN")}</b> random control</span><i>→</i>
      <span><b>{scenario.joonDelivered.toLocaleString("en-IN")}</b> sent by Joon ({treatmentShare}%)</span>
    </div>
    <div className="v3-calc__results">
      <article><span className="mono">Illustrative list-based plan</span><strong>{incumbent === null ? "Outside modelled range" : money(incumbent, values.currency)}</strong><p>every month, based on active profiles—whether the emails work or not</p></article>
      <article className="is-joon"><span className="mono">Joon at 5%</span><strong>{money(scenario.invoice.totalMinor, values.currency)}</strong><p>on {money(scenario.attributedRevenueMinor, values.currency)} attributed revenue</p><b>{saving !== null && saving > 0 ? `${money(saving, values.currency)} less in this model` : "Zero attributed revenue means zero fee"}</b></article>
    </div>
    <div className="v3-calc__breakdown mono">
      <p>Campaigns: {scenario.joonDelivered.toLocaleString("en-IN")} delivered × {values.clickThroughRate}% clicked × {values.conversionRate}% ordered = {scenario.campaignOrders.toLocaleString("en-IN")} orders = {money(scenario.campaignAttributedRevenueMinor, values.currency)}</p>
      <p>Abandoned cart: {values.sessions.toLocaleString("en-IN")} sessions × {values.cartIncidence}% carts × {values.recoveryRate}% recovered = {scenario.recoveredJourneyOrders.toLocaleString("en-IN")} orders = {money(scenario.journeyAttributedRevenueMinor, values.currency)}</p>
    </div>
    <p className="v3-calc__explain">Joon charges only 5% of non-cancelled order revenue attributed to an email it actually sent within seven days. Deliberately-left-alone and control customers are never billed. Sending and the email creator are included.</p>
    <p className="v3-calc__fine mono">Illustrative model, not a forecast. Opens are diagnostic; click-through is calculated from delivered emails. The journey example includes abandoned-cart recovery only. Random controls are pooled over time for proof and learning, never used to calculate the invoice. The list-based figure is an illustrative comparison, not a quote.</p>
    <button className="v3-calc__share mono" type="button" onClick={copyLink}>{copied ? "Link copied" : "Copy this estimate"}</button>
  </div>;
}

function EditableField({ label, value, min, max, set, prefix = "" }: { label: string; value: number; min: number; max: number; set: (value: number) => void; prefix?: string }) {
  const id = useId();
  return <div className="v3-calc__field"><label htmlFor={id}>{label} <b>{prefix}{value.toLocaleString("en-IN")}</b></label><input id={id} type="number" min={min} max={max} value={value} onChange={(event) => set(clamp(Number(event.target.value), min, max))} /></div>;
}
function LogSubscribers({ value, set }: { value: number; set: (value: number) => void }) {
  const id = useId(); const span = MAX_COMPARABLE_SUBSCRIBERS / MIN_SUBSCRIBERS; const position = Math.log(value / MIN_SUBSCRIBERS) / Math.log(span) * 1000;
  return <div className="v3-calc__field"><label htmlFor={id}>Active email subscribers <b>{value.toLocaleString("en-IN")}</b></label><input id={id} type="range" min="0" max="1000" value={position} aria-valuetext={`${value.toLocaleString("en-IN")} subscribers`} onChange={(event) => set(clamp(MIN_SUBSCRIBERS * Math.pow(span, Number(event.target.value) / 1000), MIN_SUBSCRIBERS, MAX_COMPARABLE_SUBSCRIBERS))} /><EditableField label="Type subscriber count" value={value} min={MIN_SUBSCRIBERS} max={MAX_COMPARABLE_SUBSCRIBERS} set={set} /></div>;
}
function NumberRange({ label, value, min, max, set, suffix = "", helper }: { label: string; value: number; min: number; max: number; set: (value: number) => void; suffix?: string; helper?: string }) {
  const id = useId(); return <div className="v3-calc__field"><label htmlFor={id}>{label} <b>{value}{suffix}</b></label><input id={id} type="range" min={min} max={max} value={value} aria-valuetext={`${value}${suffix}`} onChange={(event) => set(Number(event.target.value))} />{helper && <small>{helper}</small>}</div>;
}
