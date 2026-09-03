export interface CommerceCategory {
  key: string;
  label: string;
  keywords: string[];
}

/** Stable merchant-facing verticals used to turn noisy product types into useful affinities. */
export const COMMERCE_CATEGORIES: CommerceCategory[] = [
  { key: "apparel", label: "Apparel", keywords: ["apparel", "clothing", "dress", "shirt", "jeans", "trouser", "jacket", "hoodie", "lingerie"] },
  { key: "footwear", label: "Footwear", keywords: ["footwear", "shoe", "sneaker", "boot", "sandal", "heel", "slipper"] },
  { key: "jewellery", label: "Jewellery", keywords: ["jewelry", "jewellery", "necklace", "earring", "bracelet", "ring", "pendant", "gemstone"] },
  { key: "bags_accessories", label: "Bags & Accessories", keywords: ["handbag", "bag", "wallet", "belt", "scarf", "sunglass", "accessory"] },
  { key: "skincare", label: "Skincare", keywords: ["skincare", "skin care", "serum", "moisturizer", "cleanser", "toner", "sunscreen", "retinol", "face cream"] },
  { key: "makeup", label: "Makeup", keywords: ["makeup", "lipstick", "foundation", "mascara", "concealer", "blush", "eyeshadow", "cosmetic"] },
  { key: "haircare", label: "Haircare", keywords: ["haircare", "hair care", "shampoo", "conditioner", "hair oil", "hair mask"] },
  { key: "personal_care", label: "Personal Care", keywords: ["personal care", "body wash", "deodorant", "oral care", "toothpaste", "hygiene", "grooming"] },
  { key: "fragrance", label: "Fragrance", keywords: ["fragrance", "perfume", "cologne", "eau de", "body mist"] },
  { key: "nutraceuticals", label: "Nutraceuticals", keywords: ["nutraceutical", "supplement", "vitamin", "probiotic", "collagen", "omega", "magnesium"] },
  { key: "fitness", label: "Fitness & Sports", keywords: ["fitness", "sports", "workout", "yoga", "gym", "protein powder", "activewear"] },
  { key: "food", label: "Food & Pantry", keywords: ["food", "snack", "chocolate", "spice", "sauce", "honey", "granola", "cookie", "gourmet"] },
  { key: "beverages", label: "Beverages", keywords: ["beverage", "coffee", "tea", "juice", "drink", "kombucha"] },
  { key: "home_decor", label: "Home & Decor", keywords: ["home decor", "candle", "pillow", "rug", "curtain", "lamp", "vase", "furniture"] },
  { key: "kitchen", label: "Kitchen & Dining", keywords: ["kitchen", "cookware", "dinnerware", "utensil", "bakeware", "glassware"] },
  { key: "electronics", label: "Electronics", keywords: ["electronics", "phone", "laptop", "tablet", "headphone", "earbud", "speaker", "camera"] },
  { key: "baby_kids", label: "Baby & Kids", keywords: ["baby", "infant", "toddler", "kids", "children", "maternity", "diaper", "toy"] },
  { key: "pet_care", label: "Pet Care", keywords: ["pet", "dog", "cat", "puppy", "kitten", "pet food", "pet supplies"] },
  { key: "books_stationery", label: "Books & Stationery", keywords: ["book", "stationery", "notebook", "journal", "pen", "planner", "art supplies"] },
  { key: "garden", label: "Garden & Plants", keywords: ["garden", "plant", "seed", "planter", "fertilizer", "gardening"] },
];

export function classifyCommerceCategory(...signals: Array<string | null | undefined>): CommerceCategory | null {
  const text = signals.filter(Boolean).join(" ").toLowerCase();
  let best: CommerceCategory | null = null;
  let bestScore = 0;
  for (const category of COMMERCE_CATEGORIES) {
    const score = category.keywords.reduce((sum, keyword) => sum + (text.includes(keyword) ? keyword.length : 0), 0);
    if (score > bestScore) { best = category; bestScore = score; }
  }
  return best;
}
