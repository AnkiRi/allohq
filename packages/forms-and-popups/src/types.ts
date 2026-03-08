/** Configuration for a form field */
export interface FormField {
  name: string;
  type: "text" | "email" | "phone" | "select" | "checkbox";
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[]; // for select fields
}

/** Styling configuration for forms */
export interface FormStyling {
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonText?: string;
  borderRadius?: string;
  fontFamily?: string;
}

/** Incentive configuration for form submissions */
export interface IncentiveConfig {
  type: "discount" | "freeShipping";
  discountType?: "percentage" | "fixed_amount";
  discountValue?: number;
  code?: string; // auto-generated if not provided
}

/** Popup trigger configuration */
export interface PopupTriggerConfig {
  scrollPercent?: number; // 0-100 — trigger at this scroll depth
  delayMs?: number; // milliseconds to wait before showing
  pageUrl?: string; // only show on specific pages (glob pattern)
}

/** Popup styling configuration */
export interface PopupStyling {
  position?: "center" | "bottom-left" | "bottom-right" | "top-bar";
  overlayColor?: string;
  width?: string;
  animation?: "fade" | "slide-up" | "slide-down" | "scale";
}

/** Consent state per channel */
export interface ConsentState {
  email?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
}

/** Rendered form HTML output */
export interface RenderedForm {
  html: string;
  css: string;
  fields: FormField[];
}

/** Popup configuration for the widget */
export interface PopupWidgetConfig {
  popupId: string;
  formHtml: string;
  formCss: string;
  trigger: string;
  triggerConfig: PopupTriggerConfig;
  styling: PopupStyling;
}

/** Embed code output */
export interface EmbedCode {
  script: string;
  popupIds: string[];
}
