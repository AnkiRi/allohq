"use client";

import { computeCalculatorScenario, type Currency } from "@allohq/pricing";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  PRICING_CALCULATOR_DEFAULTS,
  type PricingCalculatorInitialState,
  type PricingCalculatorTool as Tool,
} from "./pricing-calculator-state";


function money(minor: number, currency: Currency) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(minor / 100);
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
}

function analyticsBucket(value: number, boundaries: number[]) {
  const ceiling = boundaries.find((candidate) => value <= candidate);
  return ceiling === undefined ? `>${boundaries.at(-1)}` : `<=${ceiling}`;
}

function recordLandingEvent(event: string, data?: Record<string, string>) {
  const body = JSON.stringify({ event, ...(data ? { data } : {}) });
  if (navigator.sendBeacon
    && navigator.sendBeacon("/api/public/landing-events", new Blob([body], { type: "application/json" }))) {
    return;
  }
  void fetch("/api/public/landing-events", {
    method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true,
  }).catch(() => undefined);
}

export function PricingCalculator({ initial = PRICING_CALCULATOR_DEFAULTS }: { initial?: PricingCalculatorInitialState }) {
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [subscribers, setSubscribers] = useState(initial.subscribers);
  const [revenue, setRevenue] = useState(initial.revenue);
  const [emailShare, setEmailShare] = useState(initial.emailShare);
  const [causedShare, setCausedShare] = useState(initial.causedShare);
  const [blasts, setBlasts] = useState(initial.blasts);
  const [tool, setTool] = useState<Tool>(initial.tool);
  const [enteredBill, setEnteredBill] = useState(initial.enteredBill);
  const [copied, setCopied] = useState(false);
  const interacted = useRef(false);
  const viewed = useRef(false);

  const markInteraction = () => {
    if (interacted.current) return;
    interacted.current = true;
    recordLandingEvent("calculator_interacted");
  };

  const scenario = useMemo(() => computeCalculatorScenario({
    activeSubscribers: subscribers,
    monthlyRevenueMinor: revenue * 100,
    emailRevenueShareBasisPoints: emailShare * 100,
    causedShareBasisPoints: causedShare * 100,
    merchantBlastCount: blasts,
    currency,
    comparisonTool: "shopify_email",
    ...(tool === "entered_bill" ? { enteredBillMinor: enteredBill * 100 } : {}),
    subscriberSnapshotAt: "illustrative-calculator",
  }), [blasts, causedShare, currency, emailShare, enteredBill, revenue, subscribers, tool]);

  useEffect(() => {
    if (!viewed.current) {
      viewed.current = true;
      recordLandingEvent("landing_view");
    }
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href="/sign-up"]');
      if (!anchor) return;
      const location = anchor.closest(".v2-nav") ? "nav" : anchor.closest(".v2-hero") ? "hero" : "close";
      recordLandingEvent("cta_clicked", { location });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    query.set("subs", String(subscribers));
    query.set("rev", String(revenue));
    query.set("email", String(emailShare));
    query.set("caused", String(causedShare));
    query.set("blasts", String(blasts));
    query.set("currency", currency);
    query.set("tool", tool);
    if (tool === "entered_bill") query.set("bill", String(enteredBill));
    else query.delete("bill");
    window.history.replaceState(null, "", `${window.location.pathname}?${query.toString()}${window.location.hash}`);
  }, [blasts, causedShare, currency, emailShare, enteredBill, revenue, subscribers, tool]);

  useEffect(() => {
    if (!interacted.current) return;
    const timer = window.setTimeout(() => recordLandingEvent("calculator_result", {
      subscribers: analyticsBucket(subscribers, [5_000, 30_000, 150_000, 600_000]),
      revenue: analyticsBucket(revenue, [500_000, 2_000_000, 10_000_000, 50_000_000]),
      emailShare: analyticsBucket(emailShare, [10, 20, 30]),
      causedShare: analyticsBucket(causedShare, [10, 30, 50]),
      blasts: analyticsBucket(blasts, [0, 4, 8, 16]),
      currency,
      tool,
      result: scenario.breakEven.currentlyCostsMore ? "above_current_tool" : "at_or_below_current_tool",
    }), 800);
    return () => window.clearTimeout(timer);
  }, [blasts, causedShare, currency, emailShare, enteredBill, revenue, scenario.breakEven.currentlyCostsMore, subscribers, tool]);

  const curve = [0, 10, 20, 30, 40, 50, 60, 70].map((share) => computeCalculatorScenario({
    activeSubscribers: subscribers,
    monthlyRevenueMinor: revenue * 100,
    emailRevenueShareBasisPoints: emailShare * 100,
    causedShareBasisPoints: share * 100,
    merchantBlastCount: blasts,
    currency,
    comparisonTool: "shopify_email",
    ...(tool === "entered_bill" ? { enteredBillMinor: enteredBill * 100 } : {}),
    subscriberSnapshotAt: "illustrative-calculator",
  }));
  const chartMax = Math.max(...curve.map((item) => item.invoice.totalMinor), scenario.traditional.priceMinor, 1);
  const points = curve.map((item, index) => `${index * (100 / 7)},${100 - item.invoice.totalMinor / chartMax * 92}`).join(" ");
  const traditionalY = 100 - scenario.traditional.priceMinor / chartMax * 92;
  const currentToolName = tool === "shopify_email" ? "Shopify Email" : "your entered bill";

  const copyLink = async () => {
    markInteraction();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      recordLandingEvent("share_link_copied");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="v3-calc" aria-label="Illustrative Joon pricing calculator">
      <div className="v3-calc__banner mono">Free during early access. This is an uncapped estimate of what you&rsquo;d pay after.</div>
      <div className="v3-calc__inputs" onInput={markInteraction} onChange={markInteraction}>
        <LogSubscribers value={subscribers} set={setSubscribers} />
        <CurrencyAmount label="Monthly store revenue" currency={currency} setCurrency={setCurrency} value={revenue} setValue={setRevenue} max={1_000_000_000} />
        <NumberRange label="Share of revenue from email" value={emailShare} min={5} max={40} step={1} set={setEmailShare} valueText={`${emailShare}%`} />
        <NumberRange label="How much of that Joon actually causes" value={causedShare} min={0} max={70} step={1} set={setCausedShare} valueText={`${causedShare}%`} helper="The part that would not have happened without the email, measured against a random holdout." />
        <NumberRange label="Blasts you'll ask for each month" value={blasts} min={0} max={31} step={1} set={setBlasts} valueText={`${blasts} blasts`} />
        <div className="v3-calc__field">
          <label htmlFor="pricing-tool">Your current tool</label>
          <select id="pricing-tool" value={tool} onChange={(event) => setTool(event.target.value as Tool)}>
            <option value="shopify_email">Shopify Email</option>
            <option value="entered_bill">Enter my bill</option>
          </select>
          {tool === "entered_bill" && <EditableNumber label="Current monthly email bill" value={enteredBill} set={setEnteredBill} min={0} max={100_000_000} />}
        </div>
      </div>
      <div className="v3-calc__results">
        <article><span className="mono">Your email tool today</span><strong>{money(scenario.traditional.priceMinor, currency)}</strong><p>a month, whether it works or not</p></article>
        <article className="is-joon"><span className="mono">Joon · before the cap</span><strong>{money(scenario.invoice.totalMinor, currency)}</strong><p>{money(scenario.invoice.liftFeeMinor, currency)} Joon fee + {money(scenario.invoice.postageMinor, currency)} postage</p><b>You keep {money(scenario.merchantKeepsMinor, currency)} of what Joon caused.</b></article>
      </div>
      <p className="v3-sr-only" aria-live="polite" aria-atomic="true">Joon before the cap is {money(scenario.invoice.totalMinor, currency)} a month. {currentToolName} is {money(scenario.traditional.priceMinor, currency)} a month.</p>
      <div className="v3-calc__chart">
        <svg viewBox="0 0 100 104" role="img" aria-labelledby="pricing-chart-title pricing-chart-desc">
          <title id="pricing-chart-title">Monthly price as caused share rises from zero to seventy percent</title>
          <desc id="pricing-chart-desc">{currentToolName} stays at {money(scenario.traditional.priceMinor, currency)}. Joon begins with requested-blast postage and rises with caused revenue. The cap line is omitted until its comparison evidence is approved.</desc>
          <line x1="0" x2="100" y1={traditionalY} y2={traditionalY} className="is-traditional" />
          <polyline points={points} className="is-joon" />
        </svg>
        <div className="v3-calc__legend"><span><i className="is-traditional" />{currentToolName}</span><span><i className="is-joon" />Joon · before cap</span></div>
        <div><span>0% caused</span><span>70% caused</span></div>
      </div>
      <p className="v3-calc__crossing">
        {scenario.breakEven.costsMoreAtZeroLift
          ? `At this blast volume, postage alone is higher than ${currentToolName}.`
          : `Before the cap, Joon costs more than ${currentToolName} only when it causes more than ${money(scenario.breakEven.causedMinor, currency)} a month - and you'd keep ${money(scenario.breakEven.merchantKeepsMinor, currency)} of that.`}
      </p>
      <p className="v3-calc__explain">{money(0, currency)} Joon fee if Joon causes nothing - postage only on blasts you ask for. Joon never profits from sending.</p>
      <p className="v3-calc__fine mono">Assumes each requested blast goes to every active subscriber and is accepted by the provider. Journeys are not included. Estimates. Joon&rsquo;s fee is measured against a random holdout. The public cap is omitted until its comparison evidence is approved. {scenario.traditional.tool === "shopify_email" && <>Shopify Email&rsquo;s <a href={scenario.traditional.sourceUrl} target="_blank" rel="noreferrer">published send pricing</a>, sourced {scenario.traditional.sourcedAt}.</>}</p>
      <button className="v3-calc__share mono" type="button" onClick={copyLink}>{copied ? "Link copied" : "Copy this estimate"}</button>
    </div>
  );
}

function EditableNumber({ label, value, set, min, max }: { label: string; value: number; set: (value: number) => void; min: number; max: number }) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    if (draft.trim() === "") { setDraft(String(value)); return; }
    const next = clamp(Number(draft), min, max);
    set(next);
    setDraft(String(next));
  };
  return <><label className="v3-sr-only" htmlFor={id}>{label}</label><input id={id} type="number" inputMode="numeric" min={min} max={max} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></>;
}

function CurrencyAmount({ label, currency, setCurrency, value, setValue, max }: { label: string; currency: Currency; setCurrency: (value: Currency) => void; value: number; setValue: (value: number) => void; max: number }) {
  const selectId = useId();
  return <div className="v3-calc__field"><span>{label}</span><span className="v3-calc__money"><label className="v3-sr-only" htmlFor={selectId}>Currency</label><select id={selectId} value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option>INR</option><option>USD</option></select><EditableNumber label={label} value={value} set={setValue} min={0} max={max} /></span></div>;
}

function LogSubscribers({ value, set }: { value: number; set: (value: number) => void }) {
  const sliderId = useId();
  const position = Math.log10(value / 1_000) / 3 * 1000;
  return <div className="v3-calc__field"><label htmlFor={sliderId}>Active email subscribers <b>{value.toLocaleString("en-IN")}</b></label><input id={sliderId} type="range" min="0" max="1000" value={position} aria-valuetext={`${value.toLocaleString("en-IN")} subscribers`} onChange={(event) => set(clamp(1_000 * Math.pow(1000, Number(event.target.value) / 1000), 1_000, 1_000_000))} /><EditableNumber label="Active email subscribers" value={value} set={set} min={1_000} max={1_000_000} /></div>;
}

function NumberRange({ label, value, min, max, step, set, valueText, helper }: { label: string; value: number; min: number; max: number; step: number; set: (value: number) => void; valueText: string; helper?: string }) {
  const id = useId();
  return <div className="v3-calc__field"><label htmlFor={id}>{label} <b>{valueText}</b></label><input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={valueText} onChange={(event) => set(Number(event.target.value))} />{helper && <small>{helper}</small>}</div>;
}
