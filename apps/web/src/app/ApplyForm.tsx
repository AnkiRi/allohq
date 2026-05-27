"use client";

export function ApplyForm() {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q1 = (document.getElementById("apply-q1") as HTMLInputElement)?.value || "";
        const q2 = (document.getElementById("apply-q2") as HTMLInputElement)?.value || "";
        const q3 = (document.getElementById("apply-q3") as HTMLInputElement)?.value || "";
        const body =
          "What do you sell?\n" + q1 +
          "\n\nHow many customers?\n" + q2 +
          "\n\nWhat are you using today?\n" + q3;
        window.location.href =
          "mailto:founders@allohq.ai?subject=" +
          encodeURIComponent("Founding cohort application") +
          "&body=" + encodeURIComponent(body);
      }}
    >
      <div className="field">
        <label htmlFor="apply-q1">What do you sell?</label>
        <input
          id="apply-q1"
          type="text"
          placeholder="e.g. slow-made linen capsules"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="apply-q2">How many customers do you have?</label>
        <input
          id="apply-q2"
          type="text"
          placeholder="ballpark is fine — 50, 500, 5,000"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label htmlFor="apply-q3">What are you using today?</label>
        <input
          id="apply-q3"
          type="text"
          placeholder="Klaviyo · Mailchimp · gut feel · nothing"
          autoComplete="off"
        />
      </div>
      <div className="actions">
        <button type="submit" className="submit">
          Send →
        </button>
        <span className="reassurance">
          We won&apos;t add you to a newsletter.
        </span>
      </div>
    </form>
  );
}
