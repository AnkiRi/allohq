import { prisma } from "@allohq/database";
import type { PopupTriggerConfig, PopupStyling, PopupWidgetConfig } from "./types";
import type { FormField, FormStyling } from "./types";
import { renderFormHtml } from "./form-builder";

/**
 * Create a new popup linked to a form.
 */
export async function createPopup(opts: {
  storeId: string;
  name: string;
  formId: string;
  trigger: "exit_intent" | "scroll" | "timer" | "page_load";
  triggerConfig?: PopupTriggerConfig;
  styling?: PopupStyling;
}) {
  return prisma.popup.create({
    data: {
      storeId: opts.storeId,
      name: opts.name,
      formId: opts.formId,
      trigger: opts.trigger,
      triggerConfig: opts.triggerConfig
        ? JSON.parse(JSON.stringify(opts.triggerConfig))
        : undefined,
      styling: opts.styling
        ? JSON.parse(JSON.stringify(opts.styling))
        : undefined,
      status: "draft",
    },
  });
}

/**
 * Update a popup.
 */
export async function updatePopup(
  popupId: string,
  data: {
    name?: string;
    trigger?: string;
    triggerConfig?: PopupTriggerConfig;
    styling?: PopupStyling;
    status?: string;
  }
) {
  return prisma.popup.update({
    where: { id: popupId },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.trigger && { trigger: data.trigger }),
      ...(data.triggerConfig && {
        triggerConfig: JSON.parse(JSON.stringify(data.triggerConfig)),
      }),
      ...(data.styling && {
        styling: JSON.parse(JSON.stringify(data.styling)),
      }),
      ...(data.status && { status: data.status }),
    },
  });
}

/**
 * Get all active popups for a store, formatted for the widget.
 */
export async function getActivePopups(storeId: string): Promise<PopupWidgetConfig[]> {
  const popups = await prisma.popup.findMany({
    where: { storeId, status: "active" },
    include: {
      form: true,
    },
  });

  return popups.map((popup) => {
    const fields = (popup.form.fields as unknown as FormField[]) ?? [];
    const formStyling = (popup.form.styling as unknown as FormStyling) ?? {};
    const rendered = renderFormHtml(fields, formStyling);

    return {
      popupId: popup.id,
      formHtml: rendered.html,
      formCss: rendered.css,
      trigger: popup.trigger,
      triggerConfig: (popup.triggerConfig as unknown as PopupTriggerConfig) ?? {},
      styling: (popup.styling as unknown as PopupStyling) ?? {
        position: "center",
        overlayColor: "rgba(0,0,0,0.5)",
        width: "420px",
        animation: "fade",
      },
    };
  });
}

/**
 * Get popup by ID.
 */
export async function getPopup(popupId: string) {
  return prisma.popup.findUnique({
    where: { id: popupId },
    include: { form: true },
  });
}

/**
 * List popups for a store.
 */
export async function listPopups(storeId: string) {
  return prisma.popup.findMany({
    where: { storeId },
    include: {
      form: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
