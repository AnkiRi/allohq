import type { VisitorSession } from "./visitor-session";

export async function mountInlineForms(apiKey: string, apiUrl: string, session: VisitorSession): Promise<void> {
  for (const host of document.querySelectorAll<HTMLElement>("[data-joon-inline-form]")) {
    const formId = host.dataset.joonInlineForm;
    if (!formId || host.dataset.joonMounted) continue;
    host.dataset.joonMounted = "true";
    const response = await fetch(`${apiUrl}/widget/form?id=${encodeURIComponent(formId)}`, { headers: { "X-Joon-Publishable-Key": apiKey, Authorization: await session.authorization() } });
    if (!response.ok) continue;
    const config = await response.json();
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${config.formCss}</style>${config.formHtml}`;
    const form = root.querySelector<HTMLFormElement>("form[data-allo-form]");
    if (!form) continue;
    const steps = Array.from(form.querySelectorAll<HTMLElement>("[data-allo-step]"));
    const move = (button: HTMLElement, direction: number) => {
      const current = button.closest<HTMLElement>("[data-allo-step]");
      if (!current) return;
      if (direction > 0 && !Array.from(current.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")).every((input) => input.reportValidity())) return;
      const target = steps[steps.indexOf(current) + direction];
      if (!target) return;
      current.hidden = true; target.hidden = false; target.querySelector<HTMLElement>("input,select")?.focus();
    };
    form.querySelectorAll<HTMLElement>("[data-allo-next]").forEach((button) => button.addEventListener("click", () => move(button, 1)));
    form.querySelectorAll<HTMLElement>("[data-allo-back]").forEach((button) => button.addEventListener("click", () => move(button, -1)));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const result = await fetch(`${apiUrl}/widget/submit`, { method: "POST", headers: { "Content-Type": "application/json", "X-Joon-Publishable-Key": apiKey, Authorization: await session.authorization() }, body: JSON.stringify({ formId, data, source: "embed" }) });
      const payload = await result.json();
      if (!result.ok) { form.setCustomValidity(payload.error ?? "Please try again"); form.reportValidity(); return; }
      root.innerHTML = `<p role="status">Thank you${payload.discountCode ? `. Your code is <strong>${payload.discountCode}</strong>` : ""}.</p>`;
    });
  }
}
