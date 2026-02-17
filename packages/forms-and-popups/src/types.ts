/** Configuration for an embeddable form */
export interface FormConfig {
  id: string;
  name: string;
  fields: FormField[];
  submitAction: "subscribe" | "custom_event";
  styling: Record<string, string>;
}

/** A single form field */
export interface FormField {
  name: string;
  type: "text" | "email" | "phone" | "select" | "checkbox";
  label: string;
  required: boolean;
}

/** Configuration for a popup */
export interface PopupConfig {
  id: string;
  name: string;
  trigger: "exit_intent" | "scroll" | "timer" | "page_load";
  delay: number;
  form: FormConfig;
  styling: Record<string, string>;
}

/** Event captured from a form or popup submission */
export interface CaptureEvent {
  formId: string;
  data: Record<string, string>;
  capturedAt: Date;
  source: "form" | "popup";
}
