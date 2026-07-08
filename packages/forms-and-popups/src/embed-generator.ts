import type { EmbedCode } from "./types";

/**
 * Generate embeddable JavaScript snippet for a store's active popups.
 * Merchants paste this into their Shopify theme's <head> section.
 */
export function generateEmbedCode(opts: {
  storeId: string;
  apiUrl: string;
  popupIds: string[];
}): EmbedCode {
  const script = `<!-- Joon Popup Widget -->
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${opts.apiUrl}/widget/popup.js';
  s.async = true;
  s.dataset.storeId = '${opts.storeId}';
  s.dataset.popups = '${opts.popupIds.join(",")}';
  s.dataset.apiUrl = '${opts.apiUrl}';
  document.head.appendChild(s);
})();
</script>`;

  return { script, popupIds: opts.popupIds };
}

/**
 * Generate a standalone embed code for a single form (no popup trigger).
 * Used for inline form embeds on specific pages.
 */
export function generateFormEmbedCode(opts: {
  formId: string;
  apiUrl: string;
}): string {
  return `<!-- Joon Form Embed -->
<div id="allo-form-${opts.formId}"></div>
<script>
(function() {
  var s = document.createElement('script');
  s.src = '${opts.apiUrl}/widget/form.js';
  s.async = true;
  s.dataset.formId = '${opts.formId}';
  s.dataset.apiUrl = '${opts.apiUrl}';
  s.dataset.target = 'allo-form-${opts.formId}';
  document.head.appendChild(s);
})();
</script>`;
}
