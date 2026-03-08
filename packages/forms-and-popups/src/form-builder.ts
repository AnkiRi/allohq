import { prisma } from "@allohq/database";
import type { FormField, FormStyling, IncentiveConfig, RenderedForm } from "./types";

/**
 * Create a new form in the database.
 */
export async function createForm(opts: {
  storeId: string;
  name: string;
  fields: FormField[];
  styling?: FormStyling;
  submitAction?: string;
  incentiveConfig?: IncentiveConfig;
}) {
  return prisma.form.create({
    data: {
      storeId: opts.storeId,
      name: opts.name,
      fields: JSON.parse(JSON.stringify(opts.fields)),
      styling: opts.styling ? JSON.parse(JSON.stringify(opts.styling)) : undefined,
      submitAction: opts.submitAction ?? "subscribe",
      incentiveConfig: opts.incentiveConfig
        ? JSON.parse(JSON.stringify(opts.incentiveConfig))
        : undefined,
      status: "draft",
    },
  });
}

/**
 * Update an existing form.
 */
export async function updateForm(
  formId: string,
  data: {
    name?: string;
    fields?: FormField[];
    styling?: FormStyling;
    submitAction?: string;
    incentiveConfig?: IncentiveConfig;
    status?: string;
  }
) {
  return prisma.form.update({
    where: { id: formId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.fields && { fields: JSON.parse(JSON.stringify(data.fields)) }),
      ...(data.styling && { styling: JSON.parse(JSON.stringify(data.styling)) }),
      ...(data.submitAction && { submitAction: data.submitAction }),
      ...(data.incentiveConfig && {
        incentiveConfig: JSON.parse(JSON.stringify(data.incentiveConfig)),
      }),
      ...(data.status && { status: data.status }),
    },
  });
}

/**
 * Render a form to HTML + CSS for embedding.
 */
export function renderFormHtml(
  fields: FormField[],
  styling?: FormStyling
): RenderedForm {
  const s: FormStyling = {
    backgroundColor: "#ffffff",
    textColor: "#1a1a1a",
    buttonColor: "#000000",
    buttonTextColor: "#ffffff",
    buttonText: "Subscribe",
    borderRadius: "8px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    ...styling,
  };

  const fieldHtml = fields
    .map((field) => {
      const requiredAttr = field.required ? "required" : "";
      const placeholderAttr = field.placeholder
        ? `placeholder="${escapeHtml(field.placeholder)}"`
        : "";

      if (field.type === "checkbox") {
        return `<label class="allo-field allo-checkbox">
          <input type="checkbox" name="${escapeHtml(field.name)}" ${requiredAttr} />
          <span>${escapeHtml(field.label)}</span>
        </label>`;
      }

      if (field.type === "select" && field.options) {
        const optionsHtml = field.options
          .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
          .join("");
        return `<div class="allo-field">
          <label>${escapeHtml(field.label)}</label>
          <select name="${escapeHtml(field.name)}" ${requiredAttr}>
            <option value="">Select...</option>
            ${optionsHtml}
          </select>
        </div>`;
      }

      const inputType = field.type === "phone" ? "tel" : field.type;
      return `<div class="allo-field">
        <label>${escapeHtml(field.label)}</label>
        <input type="${inputType}" name="${escapeHtml(field.name)}" ${placeholderAttr} ${requiredAttr} />
      </div>`;
    })
    .join("\n");

  const html = `<form class="allo-form" data-allo-form>
  ${fieldHtml}
  <button type="submit" class="allo-submit">${escapeHtml(s.buttonText ?? "Subscribe")}</button>
</form>`;

  const css = `.allo-form {
  font-family: ${s.fontFamily};
  background: ${s.backgroundColor};
  color: ${s.textColor};
  padding: 24px;
  border-radius: ${s.borderRadius};
  max-width: 400px;
}
.allo-field {
  margin-bottom: 16px;
}
.allo-field label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: ${s.textColor};
}
.allo-field input,
.allo-field select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  outline: none;
}
.allo-field input:focus,
.allo-field select:focus {
  border-color: ${s.buttonColor};
  box-shadow: 0 0 0 2px ${s.buttonColor}22;
}
.allo-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
}
.allo-checkbox input {
  width: auto;
}
.allo-submit {
  width: 100%;
  padding: 12px;
  background: ${s.buttonColor};
  color: ${s.buttonTextColor};
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.2s;
}
.allo-submit:hover {
  opacity: 0.9;
}`;

  return { html, css, fields };
}

/**
 * Get form by ID with submission count.
 */
export async function getForm(formId: string) {
  return prisma.form.findUnique({
    where: { id: formId },
    include: {
      popups: true,
      _count: { select: { submissions: true } },
    },
  });
}

/**
 * List forms for a store.
 */
export async function listForms(storeId: string) {
  return prisma.form.findMany({
    where: { storeId },
    include: {
      popups: { select: { id: true, name: true, status: true, trigger: true } },
      _count: { select: { submissions: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
