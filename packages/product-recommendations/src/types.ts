/** Strategy for generating product recommendations */
export interface RecommendationStrategy {
  id: string;
  type: "collaborative_filtering" | "content_based" | "trending" | "frequently_bought_together";
  config: Record<string, unknown>;
}

/** A scored product recommendation */
export interface ProductScore {
  productId: string;
  score: number;
  strategy: RecommendationStrategy["type"];
  reason: string;
}
