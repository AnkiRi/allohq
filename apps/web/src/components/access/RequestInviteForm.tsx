"use client";

import * as React from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

/**
 * Asking to be let in.
 *
 * The answer is the same sentence whatever happens — a new request, a repeat,
 * a rate-limited attempt, an address that already has an account. Anything that
 * varied would answer "is this address known to Joon?" for anyone who asked.
 *
 * So the form does not report errors from the server either: it acknowledges.
 * Only client-side validation, which knows nothing about who exists, can say
 * "that isn't an email address".
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
      <div className="w-full max-w-md" data-testid="request-invite-done">
        <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
          Request received
        </p>
        <h1 className="mt-3 font-serif text-[26px] leading-tight text-foreground">
          Thanks—we&rsquo;re opening Joon with a small number of design partners.
          We&rsquo;ll review your request and be in touch.
        </h1>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg border border-border px-4 py-2 text-xs font-sans text-foreground transition-colors hover:border-foreground"
        >
          Back to joon
        </Link>
      </div>
    );
  }

  return (
    <form
      className="w-full max-w-md"
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
      <p className="text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
        Closed beta
      </p>
      <h1 className="mt-3 font-serif text-[26px] leading-tight text-foreground">
        Request an invite
      </h1>
      <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
        Joon is opening with a small number of design partners. Tell us a little
        about your brand and we will get back to you.
      </p>

      <div className="mt-8 space-y-4">
        <Field label="Name" name="name" required autoComplete="name" />
        <Field label="Work email" name="email" type="email" required autoComplete="email" />
        <Field label="Company" name="company" required autoComplete="organization" />
        <Field
          label="Website or store URL"
          name="website"
          optional
          placeholder="brand.myshopify.com"
        />

        <Select label="Where do you sell?" name="platform" options={PLATFORMS} />
        <Select label="Roughly how many customers?" name="customerRange" options={RANGES} />

        <label className="block">
          <span className="text-[12px] text-muted-foreground">
            Anything you want us to know <span className="opacity-60">(optional)</span>
          </span>
          <textarea
            name="note"
            rows={3}
            maxLength={2000}
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-foreground outline-none focus:border-foreground"
          />
        </label>

        {/* Honeypot. Hidden from people and from screen readers; something that
            fills every input gives itself away. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label>
            Confirm your website
            <input name="companyWebsiteConfirm" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={submit.isPending}
        data-testid="request-invite-submit"
        className="mt-8 rounded-lg bg-secondary px-4 py-2 text-xs font-sans text-secondary-foreground transition-colors hover:bg-secondary/90 disabled:opacity-50"
      >
        {submit.isPending ? "Sending…" : "Request an invite"}
      </button>

      <p className="mt-6 text-[12px] leading-5 text-muted-foreground">
        Already have access?{" "}
        <Link href="/sign-in" className="underline underline-offset-2">
          Sign in
        </Link>
        .
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
    <label className="block">
      <span className="text-[12px] text-muted-foreground">
        {props.label}
        {props.optional && <span className="opacity-60"> (optional)</span>}
      </span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-foreground outline-none focus:border-foreground"
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
    <label className="block">
      <span className="text-[12px] text-muted-foreground">{props.label}</span>
      <select
        name={props.name}
        required
        defaultValue={props.options[0]!.value}
        className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-[13px] text-foreground outline-none focus:border-foreground"
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
