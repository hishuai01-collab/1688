import { Injectable, Logger } from "@nestjs/common";
import { ScrapeOptions } from "./types";
import { RawProductItem, ScrapeResult } from "../dto/product.dto";

type ProductCard = {
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
};

@Injectable()
export class Scraper1688Service {
  private readonly logger = new Logger(Scraper1688Service.name);
  private userAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
    const { keyword, maxPages = 1 } = options;
    const allCards: ProductCard[] = [];
    let error: string | undefined;

    for (let page = 1; page <= maxPages; page++) {
      try {
        const cards = await this.scrapeSearchPage(keyword, page);
        allCards.push(...cards);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Scrape error keyword=${keyword} page=${page}: ${msg}`);
        error = msg;
        break;
      }
    }

    const items: RawProductItem[] = allCards.map((c) => ({
      sourceId: c.sourceId,
      title: c.title,
      price: c.priceText,
      priceNum: c.priceNum,
      currency: c.currency,
      sales: c.salesCount,
      shopName: c.shopName,
      shopUrl: c.shopUrl,
      productUrl: c.productUrl,
      imageUrl: c.imageUrl,
      location: c.location,
      isDropship: c.isDropship,
    }));

    return { keyword, items, scrapedAt: new Date(), error };
  }

  async scrapeProductPage(url: string): Promise<RawProductItem | null> {
    return null;
  }

  private async scrapeSearchPage(keyword: string, page: number): Promise<ProductCard[]> {
    const encoded = encodeURIComponent(keyword);
    const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encoded}&n=y`;

    const html = await this.fetchPage(searchUrl);
    const cards = this.parseSearchPageHtml(html, keyword, page);
    this.logger.debug(`Parsed ${cards.length} cards keyword=${keyword} page=${page}`);
    return cards;
  }

  private parseSearchPageHtml(html: string, keyword: string, page = 1): ProductCard[] {
    const cards: ProductCard[] = [];

    const titleRegex = /"title"\s*:\s*"([^"]+)"/g;
    const priceRegex = /"price"\s*:\s*"([\d.]+)"/g;
    const offerIdRegex = /"offerId"\s*:\s*"(\d+)"/g;
    const imgUrlRegex = /"imgUrl"\s*:\s*"(https?:\/\/[^"]+)"/g;
    const companyRegex = /"companyName"\s*:\s*"([^"]*)"/g;
    const cityRegex = /"city"\s*:\s*"([^"]*)"/g;

    const titles: string[] = [];
    const prices: number[] = [];
    const offerIds: string[] = [];
    const imgUrls: string[] = [];
    const companyNames: string[] = [];
    const cities: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = titleRegex.exec(html))) titles.push(m[1]);
    while ((m = priceRegex.exec(html))) prices.push(parseFloat(m[1]));
    while ((m = offerIdRegex.exec(html))) offerIds.push(m[1]);
    while ((m = imgUrlRegex.exec(html))) imgUrls.push(m[1]);
    while ((m = companyRegex.exec(html))) companyNames.push(m[1] || "");
    while ((m = cityRegex.exec(html))) cities.push(m[1]);

    const count = Math.min(titles.length, prices.length, offerIds.length);

    const dec = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');

    for (let i = 0; i < count; i++) {
      const offerId = offerIds[i] || `gen-${Date.now()}-${i}`;

      cards.push({
        sourceId: String(offerId),
        title: dec(titles[i] || keyword).substring(0, 120),
        priceText: `¥${(prices[i] ?? 0).toFixed(2)}`,
        priceNum: prices[i] || 0,
        currency: "CNY",
        salesText: "未知",
        salesCount: 0,
        shopName: dec(companyNames[i] || "未知商家"),
        shopUrl: "",
        productUrl: `https://detail.1688.com/offer/${offerId}.html`,
        imageUrl: imgUrls[i] || undefined,
        location: cities[i] || undefined,
        isDropship: false,
      });
    }

    if (count === 0) {
      return this.fallbackParse(html, keyword, page);
    }

    return cards;
  }

  private fallbackParse(html: string, keyword: string, page = 1): ProductCard[] {
    const cards: ProductCard[] = [];
    const offerMatches = [...html.matchAll(/"offerId"\s*:\s*"(\d+)"/g)];

    offerMatches.forEach((m, i) => {
      const titleMatch = [...html.matchAll(/"title"\s*:\s*"([^"]+)"/g)][i];
      const rawTitle = titleMatch ? titleMatch[1] : keyword;
      const dec = (s: string) =>
        s
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"');

      cards.push({
        sourceId: m[1],
        title: dec(rawTitle).substring(0, 120),
        priceText: "¥--",
        priceNum: 0,
        currency: "CNY",
        salesText: "未知",
        salesCount: 0,
        shopName: "未知商家",
        shopUrl: "",
        productUrl: `https://detail.1688.com/offer/${m[1]}.html`,
        isDropship: false,
      });
    });

    return cards;
  }

  private async fetchPage(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    return await res.text();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
