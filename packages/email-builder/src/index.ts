export type {
  EmailBlock,
  EmailBlockType,
  TextBlock,
  ImageBlock,
  ButtonBlock,
  DividerBlock,
  SpacerBlock,
  ProductBlock,
  ProductGridBlock,
  ColumnsBlock,
  SocialBlock,
  HeaderBlock,
  FooterBlock,
  HeroBlock,
  IconRowBlock,
  CountdownBlock,
  TestimonialBlock,
  CustomHtmlBlock,
  EmailTemplate,
  ProductData,
  RenderOptions,
  RenderBrandSettings,
  TrackingParams,
  ArchetypeRenderOptions,
} from "./types";
export { createDefaultBlock } from "./types";
export { preflightEmailDocument, type EmailPreflightCheck } from "./preflight";
export {
  emailBlockSchema,
  emailBlocksSchema,
  emailDocumentSchema,
  emailCommandSchema,
  emailCommandListSchema,
  type EmailCommand,
  type EmailDocument,
} from "./schemas";

// NOTE: renderToHtml uses MJML (Node.js only — requires 'fs').
// Do NOT import from this file in client/browser code.
// Use "@allohq/email-builder/server" for renderToHtml.
// Re-exported here for backward compat with server-side consumers.
// Client bundlers: this re-export is tree-shaken if unused.
