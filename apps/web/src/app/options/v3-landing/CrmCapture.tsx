"use client";

import { FormEvent, useState } from "react";

export function CrmCapture({ formId, configured }: { formId: string | null; configured: boolean }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const enabled = Boolean(formId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formId || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/public/forms/${formId}/submit`, {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const body = (await response.json()) as { message?: string; error?: string };
      setMessage(response.ok ? body.message ?? "Check your inbox." : body.error ?? "Please try again.");
      if (response.ok) event.currentTarget.reset();
    } catch {
      setMessage("We could not save that email. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="v3-crm" onSubmit={submit} aria-describedby="v3-crm-note v3-crm-status">
      <label className="v3-crm__email">
        <span className="mono">Work email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@yourstore.com"
          required
          disabled={!enabled || submitting}
        />
      </label>
      <label className="v3-crm__consent">
        <input name="consent_email" type="checkbox" required disabled={!enabled || submitting} />
        <span>Yes, email me about Joon and my store. I can unsubscribe at any time.</span>
      </label>
      <button type="submit" disabled={!enabled || submitting}>
        {submitting ? "Saving…" : "Show me what Joon would do"}
      </button>
      <p className="mono" id="v3-crm-note">This form runs on Joon.</p>
      <p className="v3-crm__status" id="v3-crm-status" role="status" aria-live="polite">
        {message || (!enabled ? (configured ? "The Joon signup form is not active yet." : "Signup opens after the Joon CRM store is connected.") : "")}
      </p>
    </form>
  );
}
