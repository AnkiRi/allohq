"use client";

import * as React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

/**
 * Asking to be let in.
 *
 * The answer is the same sentence whatever happens — a new request, a repeat, a
 * throttled attempt, an address that already has an account. Anything that
 * varied would answer "is this address known to joon?" for anyone who asked.
 *
 * So the form does not report server errors either: it acknowledges. Only
 * client-side validation, which knows nothing about who exists, says anything
 * specific — and the browser does that.
 *
 * Styling is the landing's, not the app's: this page sits inside `.opt-v2`, so
 * it inherits that palette and typography rather than arriving in the
 * authenticated theme.
 */
const PLATFORMS = [
  { value: "shopify", label: "Shopify" },
  { value: "custom_storefront", label: "Custom storefront" },
  { value: "mobile_app", label: "Mobile app" },
] as const;

const RANGES = [
  { value: "under_10k", label: "Under 10,000" },
  { value: "10k_100k", label: "10,000 – 1 lakh" },
  { value: "100k_1m", label: "1 lakh – 10 lakh" },
  { value: "over_1m", label: "Over 10 lakh" },
] as const;

export function RequestInviteForm() {
  const [done, setDone] = React.useState(false);
  const submit = trpc.accessRequests.submit.useMutation({
    // Acknowledge either way. A failure that looked different from a success
    // would be a signal, and there is nothing here worth signalling.
    onSettled: () => setDone(true),
  });

  if (done) {
    return (
      <div data-testid="request-invite-done">
        <p className="request-invite__eyebrow">Request received</p>
        <h1 className="request-invite__title">
          Thanks—we&rsquo;re opening joon with a small number of design partners.
          We&rsquo;ll review your request and be in touch.
        </h1>
        <div className="request-invite__actions">
          <Link className="v2-btn v2-btn--ghost" href="/">
            Back to joon
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      data-testid="request-invite-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (key: string) => String(form.get(key) ?? "").trim();
        submit.mutate({
          name: value("name"),
          email: value("email"),
          company: value("company"),
          website: value("website") || undefined,
          platform: value("platform") as (typeof PLATFORMS)[number]["value"],
          customerRange: value("customerRange") as (typeof RANGES)[number]["value"],
          note: value("note") || undefined,
          companyWebsiteConfirm: value("companyWebsiteConfirm") || undefined,
        });
      }}
    >
      <p className="request-invite__eyebrow">Closed beta</p>
      <h1 className="request-invite__title">Request an invite</h1>
      <p className="request-invite__lead">
        joon is opening with a small number of design partners. Tell us a little
        about your brand and we&rsquo;ll be in touch.
      </p>

      <div className="request-invite__fields">
        <div className="request-invite__row">
          <Field label="Name" name="name" required autoComplete="name" />
          <Field label="Work email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="request-invite__row">
          <Field label="Company" name="company" required autoComplete="organization" />
          <Field label="Website or store" name="website" optional placeholder="brand.myshopify.com" />
        </div>
        <div className="request-invite__row">
          <Select label="Where you sell" name="platform" options={PLATFORMS} />
          <Select label="Customers, roughly" name="customerRange" options={RANGES} />
        </div>

        <label>
          <span className="request-invite__label">
            Anything we should know <span className="request-invite__optional">(optional)</span>
          </span>
          <textarea name="note" rows={3} maxLength={2000} className="request-invite__control" />
        </label>

        {/* Honeypot: hidden from people and from screen readers. Something
            filling every input gives itself away. */}
        <div aria-hidden="true" className="request-invite__trap">
          <label>
            Confirm your website
            <input name="companyWebsiteConfirm" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </div>

      <div className="request-invite__actions">
        <button
          type="submit"
          disabled={submit.isPending}
          data-testid="request-invite-submit"
          className="v2-btn v2-btn--primary v2-btn--lg"
        >
          {submit.isPending ? "Sending…" : "Request an invite"}
        </button>
      </div>

      {/* Subtle, and worded so it cannot read as a second way in: signing in
          is for people who already have access, not a route to getting it. */}
      <p className="request-invite__note">
        Already have Joon access? <Link href="/sign-in">Sign in</Link>.
      </p>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label>
      <span className="request-invite__label">
        {props.label}
        {props.optional && <span className="request-invite__optional"> (optional)</span>}
      </span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        className="request-invite__control"
      />
    </label>
  );
}

function Select(props: {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label>
      <span className="request-invite__label">{props.label}</span>
      <select
        name={props.name}
        required
        defaultValue={props.options[0]!.value}
        className="request-invite__control"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
