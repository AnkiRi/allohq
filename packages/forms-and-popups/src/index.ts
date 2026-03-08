// Types
export type {
  FormField,
  FormStyling,
  IncentiveConfig,
  PopupTriggerConfig,
  PopupStyling,
  ConsentState,
  RenderedForm,
  PopupWidgetConfig,
  EmbedCode,
} from "./types";

// Form builder
export {
  createForm,
  updateForm,
  renderFormHtml,
  getForm,
  listForms,
} from "./form-builder";

// Popup engine
export {
  createPopup,
  updatePopup,
  getActivePopups,
  getPopup,
  listPopups,
} from "./popup-engine";

// Incentive logic
export { deliverIncentive } from "./incentive-logic";

// Consent capture
export {
  captureSubmission,
  getCustomerConsent,
  listSubmissions,
} from "./consent-capture";

// Embed generator
export {
  generateEmbedCode,
  generateFormEmbedCode,
} from "./embed-generator";
