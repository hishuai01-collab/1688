export interface ScrapeOptions {
  keyword: string;
  maxPages?: number;
  sortBy?: "default" | "sales" | "price_asc" | "price_desc" | "credit";
}

export interface ProductCard {
  sourceId: string;
  title: string;
  priceText: string;
  priceNum: number;
  currency: string;
  salesText: string;
  salesCount: number;
  shopName: string;
  shopUrl: string;
  productUrl: string;
  imageUrl?: string;
  location?: string;
  isDropship: boolean;
}
