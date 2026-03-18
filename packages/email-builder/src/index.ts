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
  EmailTemplate,
  ProductData,
  RenderOptions,
  RenderBrandSettings,
  TrackingParams,
  ArchetypeRenderOptions,
} from "./types";
export { createDefaultBlock } from "./types";

// NOTE: renderToHtml uses MJML (Node.js only — requires 'fs').
// Do NOT import from this file in client/browser code.
// Use "@allohq/email-builder/server" for renderToHtml.
// Re-exported here for backward compat with server-side consumers.
// Client bundlers: this re-export is tree-shaken if unused.
