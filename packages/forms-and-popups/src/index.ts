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
export { createConsentConfirmation, redeemConsentConfirmation } from "./confirmation";

// Consent capture
export {
  captureSubmission,
  getCustomerConsent,
  listSubmissions,
} from "./consent-capture";
