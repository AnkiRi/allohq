/** Strategy type identifiers */
export type StrategyType =
  | "affinity"
  | "collaborative"
  | "reorder"
  | "cross_sell"
  | "trending";

/** Strategy for generating product recommendations */
export interface RecommendationStrategy {
  id: string;
  type: StrategyType;
  config: Record<string, unknown>;
}

/** A scored product recommendation */
export interface ProductScore {
  productId: string;
  score: number;
  strategy: StrategyType;
  reason: string;
}

/** Co-purchase affinity between two products */
export interface AffinityPair {
  productA: string;
  productB: string;
  coCount: number;
  confidence: number;
}

/** Request for personalized recommendations */
export interface RecommendationRequest {
  storeId: string;
  customerId?: string;
  limit: number;
  strategies?: StrategyType[];
  excludeProductIds?: string[];
}

/** Enriched recommendation result with product data */
export interface RecommendationResult {
  productId: string;
  score: number;
  strategy: StrategyType;
  reason: string;
  title?: string;
  imageUrl?: string;
  price?: number;
  inStock?: boolean;
}

/** Resolved product data for rendering */
export interface ResolvedProduct {
  productId: string;
  title: string;
  price: number;
  compareAtPrice?: number;
  imageUrl: string;
  handle?: string;
  inStock: boolean;
}
