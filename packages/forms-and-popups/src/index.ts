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
export { deliverIncentive, chooseWeightedOutcome } from "./incentive-logic";
export { createConsentConfirmation, redeemConsentConfirmation } from "./confirmation";
export { assignFormExperimentArm } from "./experiment-assignment";
export type { FormExperimentArm } from "./experiment-assignment";
export { CONSENT_PRESETS, consentPreset } from "./consent-presets";
export type { ConsentMarket } from "./consent-presets";
export { shouldSuppressKnownCustomerIncentive } from "./acquisition-policy";

// Consent capture
export {
  captureSubmission,
  getCustomerConsent,
  listSubmissions,
} from "./consent-capture";
