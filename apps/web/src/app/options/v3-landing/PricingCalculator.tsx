"use client";

import {
  computeCalculatorScenario,
  KLAVIYO_EMAIL_USD_EVIDENCE,
  type Currency,
} from "@allohq/pricing";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  derivedRevenueMajor,
  MAX_COMPARABLE_SUBSCRIBERS,
  MIN_SUBSCRIBERS,
  PRICING_CALCULATOR_DEFAULTS,
  type PricingCalculatorInitialState,
} from "./pricing-calculator-state";

const CAUSED_SHARES = [0, 10, 20, 30, 40, 50, 60, 70];

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
  const [emailShare, setEmailShare] = useState(initial.emailShare);
  const [causedShare, setCausedShare] = useState(initial.causedShare);
  const [blasts, setBlasts] = useState(initial.blasts);
  const [copied, setCopied] = useState(false);
  const interacted = useRef(false);
  const viewed = useRef(false);

  // Revenue follows list size rather than being typed. As a free input it could
  // describe a store that cannot exist, which pinned the fee to its cap and made
  // the page look stuck.
  const revenue = derivedRevenueMajor(subscribers, currency);

  const markInteraction = () => {
    if (interacted.current) return;
    interacted.current = true;
    recordLandingEvent("calculator_interacted");
  };

  const scenarioFor = useMemo(() => (share: number) => computeCalculatorScenario({
    activeSubscribers: subscribers,
    monthlyRevenueMinor: revenue * 100,
    emailRevenueShareBasisPoints: emailShare * 100,
    causedShareBasisPoints: share * 100,
    merchantBlastCount: blasts,
    currency,
    comparisonTool: "klaviyo",
    traditionalComparisonEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    calculatorCapEvidence: [KLAVIYO_EMAIL_USD_EVIDENCE],
    subscriberSnapshotAt: "illustrative-calculator",
  }), [blasts, currency, emailShare, revenue, subscribers]);

  const scenario = useMemo(() => scenarioFor(causedShare), [causedShare, scenarioFor]);

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
    query.set("email", String(emailShare));
    query.set("caused", String(causedShare));
    query.set("blasts", String(blasts));
    query.set("currency", currency);
    // Revenue is derived, so it never travels in the link.
    query.delete("rev");
    query.delete("tool");
    query.delete("bill");
    window.history.replaceState(null, "", `${window.location.pathname}?${query.toString()}${window.location.hash}`);
  }, [blasts, causedShare, currency, emailShare, subscribers]);

  useEffect(() => {
    if (!interacted.current) return;
    const timer = window.setTimeout(() => recordLandingEvent("calculator_result", {
      subscribers: analyticsBucket(subscribers, [5_000, 30_000, 70_000, 150_000]),
      emailShare: analyticsBucket(emailShare, [10, 20, 30]),
      causedShare: analyticsBucket(causedShare, [10, 30, 50]),
      blasts: analyticsBucket(blasts, [0, 4, 8, 16]),
      currency,
    }), 800);
    return () => window.clearTimeout(timer);
  }, [blasts, causedShare, currency, emailShare, subscribers]);

  const curve = CAUSED_SHARES.map((share) => scenarioFor(share));
  const chartMax = Math.max(...curve.map((item) => item.invoice.totalMinor), scenario.traditional.priceMinor, 1);
  const points = curve
    .map((item, index) => `${index * (100 / (CAUSED_SHARES.length - 1))},${100 - item.invoice.totalMinor / chartMax * 92}`)
    .join(" ");
  const traditionalY = 100 - scenario.traditional.priceMinor / chartMax * 92;
  const savingMinor = scenario.traditional.priceMinor - scenario.invoice.totalMinor;

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
      <div className="v3-calc__banner mono">Free during early access. This is what you&rsquo;d pay after.</div>
      <div className="v3-calc__inputs" onInput={markInteraction} onChange={markInteraction}>
        <LogSubscribers value={subscribers} set={setSubscribers} />
        <div className="v3-calc__field v3-calc__derived">
          <span>
            Monthly store revenue
            <label className="v3-sr-only" htmlFor="pricing-currency">Currency</label>
            <select id="pricing-currency" value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
              <option>INR</option><option>USD</option>
            </select>
          </span>
          <strong>{money(revenue * 100, currency)}</strong>
          <small>
            Taken from your list size: as many monthly visits as subscribers, 1% of them buying at
            {" "}{money(currency === "INR" ? 200_000 : 2_000, currency)}, plus 20% repeat from the list itself.
          </small>
        </div>
        <NumberRange
          label="Of that, what email gets credited for"
          value={emailShare} min={5} max={40} step={1} set={setEmailShare} valueText={`${emailShare}%`}
          helper="What your current tool reports as email revenue — every sale that followed an email, whether or not the email mattered."
        />
        <NumberRange
          label="Of that, what Joon actually caused"
          value={causedShare} min={0} max={70} step={1} set={setCausedShare} valueText={`${causedShare}%`}
          helper="The part that would not have happened anyway, measured against customers held back at random. Joon charges on this alone."
        />
        <p className="v3-calc__chain mono" aria-live="polite">
          {money(revenue * 100, currency)} revenue
          {" → "}{money(scenario.emailRevenueMinor, currency)} credited to email
          {" → "}{money(scenario.causedMinor, currency)} Joon caused
          {" → "}{money(scenario.invoice.liftFeeMinor, currency)} fee
        </p>
        <NumberRange label="Blasts you'll ask for each month" value={blasts} min={0} max={31} step={1} set={setBlasts} valueText={`${blasts} blasts`} />
      </div>
      <div className="v3-calc__results">
        <article>
          <span className="mono">Your email platform today</span>
          <strong>{money(scenario.traditional.priceMinor, currency)}</strong>
          <p>a month, on list size alone — whether it works or not</p>
        </article>
        <article className="is-joon">
          <span className="mono">Joon, all in</span>
          <strong>{money(scenario.invoice.totalMinor, currency)}</strong>
          <p>
            {money(scenario.invoice.liftFeeMinor, currency)} outcome fee
            {" + "}
            {money(scenario.invoice.postageMinor, currency)} postage at cost
          </p>
          <b>{money(savingMinor, currency)} less, and you keep {money(scenario.merchantKeepsMinor, currency)} of what Joon caused.</b>
        </article>
      </div>
      <p className="v3-sr-only" aria-live="polite" aria-atomic="true">
        Joon costs {money(scenario.invoice.totalMinor, currency)} a month all in:
        {" "}{money(scenario.invoice.liftFeeMinor, currency)} outcome fee plus
        {" "}{money(scenario.invoice.postageMinor, currency)} postage. The published platform benchmark is
        {" "}{money(scenario.traditional.priceMinor, currency)} a month, so Joon is
        {" "}{money(savingMinor, currency)} less.
      </p>
      <div className="v3-calc__chart">
        <svg viewBox="0 0 100 104" role="img" aria-labelledby="pricing-chart-title pricing-chart-desc">
          <title id="pricing-chart-title">Monthly total as caused share rises from zero to seventy percent</title>
          <desc id="pricing-chart-desc">The platform benchmark stays at {money(scenario.traditional.priceMinor, currency)}. Joon&rsquo;s total starts at postage alone, rises only with caused revenue, and always stays below the benchmark.</desc>
          <line x1="0" x2="100" y1={traditionalY} y2={traditionalY} className="is-traditional" />
          <polyline points={points} className="is-joon" />
        </svg>
        <div className="v3-calc__legend"><span><i className="is-traditional" />Your platform today</span><span><i className="is-joon" />Joon, all in</span></div>
        <div><span>0% caused</span><span>70% caused</span></div>
      </div>
      <p className="v3-calc__crossing">
        Joon stays below your platform at every level: the outcome fee is capped so that fee plus postage never reaches the benchmark.
      </p>
      <p className="v3-calc__explain">{money(0, currency)} outcome fee if Joon causes nothing &mdash; postage only on blasts you ask for. Joon never profits from sending.</p>
      <p className="v3-calc__fine mono">
        Assumes every blast reaches every subscriber; Joon&rsquo;s suppression usually sends fewer.
        {" "}Journeys are not included. Estimates. Joon&rsquo;s fee is measured against a random holdout.
        {scenario.traditional.tool !== "entered_bill" && <>
          {" "}Benchmark is the platform&rsquo;s <a href={scenario.traditional.sourceUrl} target="_blank" rel="noreferrer">published Email-plan pricing</a>, sourced {scenario.traditional.sourcedAt}.
          {" "}It excludes add-ons a real account usually carries (SMS, reviews, customer data), so a genuine bill is normally higher than shown.
          {" "}Published prices stop at {MAX_COMPARABLE_SUBSCRIBERS.toLocaleString("en-IN")} profiles, so this estimator stops there too.
        </>}
      </p>
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

function LogSubscribers({ value, set }: { value: number; set: (value: number) => void }) {
  const sliderId = useId();
  const span = MAX_COMPARABLE_SUBSCRIBERS / MIN_SUBSCRIBERS;
  const position = Math.log(value / MIN_SUBSCRIBERS) / Math.log(span) * 1000;
  return (
    <div className="v3-calc__field">
      <label htmlFor={sliderId}>Active email subscribers <b>{value.toLocaleString("en-IN")}</b></label>
      <input
        id={sliderId}
        type="range"
        min="0"
        max="1000"
        value={position}
        aria-valuetext={`${value.toLocaleString("en-IN")} subscribers`}
        onChange={(event) => set(clamp(MIN_SUBSCRIBERS * Math.pow(span, Number(event.target.value) / 1000), MIN_SUBSCRIBERS, MAX_COMPARABLE_SUBSCRIBERS))}
      />
      <EditableNumber label="Active email subscribers" value={value} set={set} min={MIN_SUBSCRIBERS} max={MAX_COMPARABLE_SUBSCRIBERS} />
    </div>
  );
}

function NumberRange({ label, value, min, max, step, set, valueText, helper }: { label: string; value: number; min: number; max: number; step: number; set: (value: number) => void; valueText: string; helper?: string }) {
  const id = useId();
  return <div className="v3-calc__field"><label htmlFor={id}>{label} <b>{valueText}</b></label><input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={valueText} onChange={(event) => set(Number(event.target.value))} />{helper && <small>{helper}</small>}</div>;
}
