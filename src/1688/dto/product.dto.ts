export interface RawProductItem {
  sourceId: string;
  title: string;
  price: string;
  priceNum: number;
  currency: string;
  sales: number;
  shopName: string;
  shopUrl: string;
  productUrl: string;
  imageUrl?: string;
  category?: string;
  location?: string;
  isDropship?: boolean;
}

export interface KeywordConfig {
  term: string;
  enabled: boolean;
}

export interface ScrapeResult {
  keyword: string;
  items: RawProductItem[];
  scrapedAt: Date;
  error?: string;
}

export interface ScoreResult {
  productId: number;
  sourceId: string;
  title: string;
  heatScore: number;
  price: string;
  sales: number;
  shopName: string;
  productUrl: string;
  imageUrl?: string;
  components: {
    salesScore: number;
    trendScore: number;
    priceScore: number;
    sellerScore: number;
    dropshipBonus: number;
  };
}

export type PushTier = "A" | "B" | "C" | "D";

export interface PushItem {
  tier: PushTier;
  product: ScoreResult;
  reason: string;
}
