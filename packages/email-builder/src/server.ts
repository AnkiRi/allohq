// Server-only exports (Node.js only — uses MJML which requires 'fs')
// Import from "@allohq/email-builder/server" in API routes and workers.
export { renderToHtml, renderFromArchetype } from "./renderer";
export type { RenderOptions, RenderBrandSettings, TrackingParams, ArchetypeRenderOptions } from "./types";
