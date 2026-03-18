// Types
export type {
  BrandDesignTokens,
  BrandAesthetic,
  TemplateArchetypeId,
  ContentSlots,
  ProductSlot,
  ChannelSpec,
  ImageSizes,
  OverlayConfig,
  GeneratedAsset,
  TemplateArchetype,
} from "./types";
export { DEFAULT_BRAND_TOKENS, CAMPAIGN_ARCHETYPE_MAP } from "./types";

// Brand Kit
export { extractBrandKit } from "./brand-kit";

// Product Image Processing
export { processProductImage, processAllProductImages, processProductImageById } from "./product-image-processor";

// Overlay Engine
export { addDiscountBadge, addNewTag, addPriceLabel, addStockBadge, addStarRating, applyOverlay } from "./overlay-engine";

// Template Renderer
export { renderMjmlTemplate, previewTemplate, listArchetypes, getArchetype, TEMPLATE_ARCHETYPES } from "./template-renderer";

// Template Selector
export { selectTemplate, getTemplateRecommendations } from "./template-selector";

// AI Image Generator
export { buildBackgroundPrompt, generateBackground } from "./ai-image-generator";

// Channel Formatter
export { formatForChannel, formatForAllChannels, CHANNEL_SPECS } from "./channel-formatter";

// Asset Manager
export { storeAsset, getAsset, listAssets, linkToCampaign, deleteAsset } from "./asset-manager";

// Subject Line Scorer
export { scoreSubjectLine } from "./subject-line-scorer";
export type { SubjectLineScore } from "./subject-line-scorer";
