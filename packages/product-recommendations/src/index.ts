// Types
export type {
  StrategyType,
  RecommendationStrategy,
  ProductScore,
  AffinityPair,
  RecommendationRequest,
  RecommendationResult,
  ResolvedProduct,
} from "./types";

// Scoring engine (main entry point)
export { getRecommendations, scoreAndMerge } from "./scoring/engine";

// Individual strategies
export { buildAffinityMatrix, getAffinityRecommendations } from "./strategies/affinity-matrix";
export { getCollaborativeRecommendations } from "./strategies/collaborative-filtering";
export { getReorderRecommendations } from "./strategies/reorder-engine";
export { getCrossSellRecommendations } from "./strategies/cross-sell";
export { getTrendingProducts } from "./strategies/trending";

// Resolver
export { resolveProducts } from "./resolver";
