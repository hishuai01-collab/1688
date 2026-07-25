import { Injectable, Logger } from "@nestjs/common";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { ScrapeOptions } from "./types";
import { RawProductItem, ScrapeResult } from "../dto/product.dto";
import { FingerprintManager, FingerprintOptions } from "./fingerprint";
import { CookieManager } from "./cookie-manager";
import { ProxyPool } from "./proxy-pool";
import { CaptchaHandler } from "./captcha-handler";

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
export class PlaywrightScraper1688Service {
  private readonly logger = new Logger(PlaywrightScraper1688Service.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private cookieManager: CookieManager;
  private proxyPool: ProxyPool;
  private captchaHandler: CaptchaHandler;
  private fingerprint: FingerprintOptions;
  private readonly requestDelay: number;
  private readonly maxRetries: number;

  constructor() {
    this.cookieManager = new CookieManager();
    this.proxyPool = new ProxyPool();
    this.captchaHandler = new CaptchaHandler();
    this.fingerprint = FingerprintManager.generateRandomFingerprint();
    this.requestDelay = parseInt(process.env.REQUEST_DELAY || "3000");
    this.maxRetries = parseInt(process.env.MAX_RETRIES || "3");
  }

  async initBrowser(): Promise<void> {
    if (this.browser) return;

    this.fingerprint = FingerprintManager.generateRandomFingerprint();
    const launchOptions = FingerprintManager.getPlaywrightLaunchOptions(this.fingerprint);
    const contextOptions = FingerprintManager.getBrowserContextOptions(this.fingerprint);

    const proxy = this.proxyPool.getNextProxy();
    if (proxy) {
      (launchOptions as any).proxy = {
        server: this.proxyPool.getProxyServerString(proxy),
      };
      this.logger.log(`Using proxy: ${proxy.host}:${proxy.port}`);
    }

    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext(contextOptions);

    const stealthScript = FingerprintManager.getStealthScript(this.fingerprint);
    await this.context.addInitScript(stealthScript);

    const savedCookies = this.cookieManager.loadCookies();
    if (savedCookies.length > 0) {
      const playwrightCookies = this.cookieManager.toPlaywrightCookies(savedCookies);
      await this.context.addCookies(playwrightCookies);
      this.logger.log(`Loaded ${savedCookies.length} saved cookies`);
    }

    await this.context.setExtraHTTPHeaders({
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "Sec-Ch-Ua-Mobile": this.fingerprint.isMobile ? "?1" : "?0",
      "Sec-Ch-Ua-Platform": this.fingerprint.isMobile ? '"iOS"' : '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    });
  }

  async closeBrowser(): Promise<void> {
    if (this.context) {
      const cookies = await this.context.cookies();
      const cookieObjs = this.cookieManager.fromPlaywrightCookies(cookies);
      this.cookieManager.saveCookies(cookieObjs);
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
    const { keyword, maxPages = 1 } = options;
    const allCards: ProductCard[] = [];
    let error: string | undefined;

    await this.initBrowser();

    for (let page = 1; page <= maxPages; page++) {
      try {
        const cards = await this.scrapeSearchPage(keyword, page);
        allCards.push(...cards);

        if (page < maxPages) {
          const delay = this.requestDelay + Math.floor(Math.random() * 2000);
          this.logger.debug(`Waiting ${delay}ms before next request`);
          await this.sleep(delay);
        }
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

  private async scrapeSearchPage(keyword: string, page: number): Promise<ProductCard[]> {
    const encoded = encodeURIComponent(keyword);
    const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encoded}&n=y`;

    const pageObj = await this.context!.newPage();
    await pageObj.setExtraHTTPHeaders({
      "Referer": "https://www.1688.com/",
    });

    let retryCount = 0;
    let html = "";

    while (retryCount < this.maxRetries) {
      try {
        this.logger.debug(`Fetching: ${searchUrl} (attempt ${retryCount + 1})`);
        await pageObj.goto(searchUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });

        await pageObj.waitForTimeout(3000);

        const captchaResult = await this.captchaHandler.handleCaptcha(pageObj);
        if (captchaResult.handled) {
          this.logger.log(`CAPTCHA handled: ${captchaResult.message}`);
          await pageObj.waitForTimeout(2000);
        }

        const currentUrl = pageObj.url();
        if (currentUrl.includes("captcha") || currentUrl.includes("verify")) {
          this.logger.warn("Redirected to CAPTCHA page, retrying with new proxy");
          await this.rotateProxyAndRetry();
          retryCount++;
          continue;
        }

        html = await pageObj.content();

        if (html.length < 1000 || html.includes("验证码") || html.includes("anti-bot")) {
          this.logger.warn(`Page content suspicious, length=${html.length}`);
          await this.rotateProxyAndRetry();
          retryCount++;
          continue;
        }

        const proxy = this.proxyPool.getNextProxy();
        if (proxy) this.proxyPool.markProxySuccess(proxy);
        break;
      } catch (err) {
        retryCount++;
        this.logger.warn(`Fetch attempt ${retryCount} failed: ${err instanceof Error ? err.message : err}`);
        if (retryCount >= this.maxRetries) {
          throw new Error(`Failed after ${this.maxRetries} attempts: ${err instanceof Error ? err.message : err}`);
        }
        await this.rotateProxyAndRetry();
      }
    }

    await pageObj.close();
    const cards = this.parseSearchPageHtml(html, keyword, page);
    this.logger.debug(`Parsed ${cards.length} cards keyword=${keyword} page=${page}`);
    return cards;
  }

  private async rotateProxyAndRetry(): Promise<void> {
    const proxy = this.proxyPool.getNextProxy();
    if (proxy) {
      this.proxyPool.markProxyFailed(proxy);
      this.logger.log(`Rotating proxy after failure`);
    }
    await this.closeBrowser();
    await this.initBrowser();
    await this.sleep(2000 + Math.floor(Math.random() * 3000));
  }

  private parseSearchPageHtml(html: string, keyword: string, page = 1): ProductCard[] {
    const cards: ProductCard[] = [];

    const jsonMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const offers = data?.data?.data?.offerList || data?.data?.offerList || [];
        if (offers.length > 0) {
          this.logger.debug(`Extracted ${offers.length} offers from INITIAL_STATE`);
          return this.parseJsonOffers(offers, keyword);
        }
      } catch (err) {
        this.logger.debug(`Failed to parse INITIAL_STATE: ${err instanceof Error ? err.message : err}`);
      }
    }

    const offerMatches = [...html.matchAll(/"offerId"\s*:\s*"(\d+)"/g)];
    const titleMatches = [...html.matchAll(/"title"\s*:\s*"([^"]+)"/g)];
    const priceMatches = [...html.matchAll(/"price"\s*:\s*"([\d.]+)"/g)];
    const imgMatches = [...html.matchAll(/"imgUrl"\s*:\s*"(https?:\/\/[^"]+)"/g)];
    const companyMatches = [...html.matchAll(/"companyName"\s*:\s*"([^"]*)"/g)];
    const cityMatches = [...html.matchAll(/"city"\s*:\s*"([^"]*)"/g)];

    const count = Math.min(offerMatches.length, titleMatches.length, priceMatches.length);
    const dec = (s: string) =>
      s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, '"').replace(/\\n/g, " ").replace(/\\"/g, '"');

    for (let i = 0; i < count; i++) {
      const offerId = offerMatches[i][1];
      cards.push({
        sourceId: String(offerId),
        title: dec(titleMatches[i]?.[1] || keyword).substring(0, 120),
        priceText: `¥${(parseFloat(priceMatches[i]?.[1] || "0")).toFixed(2)}`,
        priceNum: parseFloat(priceMatches[i]?.[1] || "0"),
        currency: "CNY",
        salesText: "未知",
        salesCount: 0,
        shopName: dec(companyMatches[i]?.[1] || "未知商家"),
        shopUrl: "",
        productUrl: `https://detail.1688.com/offer/${offerId}.html`,
        imageUrl: imgMatches[i]?.[1],
        location: cityMatches[i]?.[1],
        isDropship: false,
      });
    }

    if (count === 0) {
      return this.fallbackParse(html, keyword, page);
    }
    return cards;
  }

  private parseJsonOffers(offers: any[], keyword: string): ProductCard[] {
    const cards: ProductCard[] = [];
    for (const offer of offers) {
      const sourceId = String(offer.offerId || offer.id || `gen-${Date.now()}-${Math.random()}`);
      const title = offer.title || keyword;
      const priceInfo = offer.price || offer.priceInfo || {};
      const priceNum = parseFloat(priceInfo.originalPrice || priceInfo.price || "0");
      const companyInfo = offer.company || offer.seller || {};
      const imageInfo = offer.image || offer.imgUrl || offer.picUrl || "";

      cards.push({
        sourceId,
        title: title.substring(0, 120),
        priceText: `¥${priceNum.toFixed(2)}`,
        priceNum,
        currency: "CNY",
        salesText: offer.salesCount ? `${offer.salesCount}笔` : "未知",
        salesCount: offer.salesCount || offer.sales || 0,
        shopName: companyInfo.name || companyInfo.companyName || "未知商家",
        shopUrl: companyInfo.url || companyInfo.shopUrl || "",
        productUrl: offer.detailUrl || offer.productUrl || `https://detail.1688.com/offer/${sourceId}.html`,
        imageUrl: imageInfo,
        location: offer.city || offer.location || undefined,
        isDropship: offer.isDropship || false,
      });
    }
    return cards;
  }

  private fallbackParse(html: string, keyword: string, page = 1): ProductCard[] {
    const cards: ProductCard[] = [];
    const offerMatches = [...html.matchAll(/"offerId"\s*:\s*"(\d+)"/g)];
    offerMatches.forEach((m, i) => {
      const titleMatch = [...html.matchAll(/"title"\s*:\s*"([^"]+)"/g)][i];
      const rawTitle = titleMatch ? titleMatch[1] : keyword;
      const dec = (s: string) => s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, '"');
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

  async scrapeProductPage(url: string): Promise<RawProductItem | null> {
    await this.initBrowser();
    const pageObj = await this.context!.newPage();
    try {
      await pageObj.setExtraHTTPHeaders({ "Referer": "https://s.1688.com/" });
      await pageObj.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      await pageObj.waitForTimeout(3000);

      const captchaResult = await this.captchaHandler.handleCaptcha(pageObj);
      if (captchaResult.handled) {
        this.logger.log(`Product page CAPTCHA handled: ${captchaResult.message}`);
        await pageObj.waitForTimeout(2000);
      }

      const data = await pageObj.evaluate(() => {
        const titleEl = document.querySelector("h1");
        const priceEl = document.querySelector(".price, .tm-price, [class*='price']");
        const salesEl = document.querySelector("[class*='sales'], [class*='count']");
        const shopEl = document.querySelector(".shop-name, .seller-name, [class*='shop']");
        return {
          title: titleEl?.textContent?.trim() || "",
          price: priceEl?.textContent?.trim() || "",
          sales: salesEl?.textContent?.trim() || "",
          shopName: shopEl?.textContent?.trim() || "",
        };
      });

      if (!data.title) return null;
      const priceMatch = data.price.match(/[\d.]+/);
      const priceNum = priceMatch ? parseFloat(priceMatch[0]) : 0;

      return {
        sourceId: url.match(/offer\/(\d+)/)?.[1] || "",
        title: data.title,
        price: data.price,
        priceNum,
        currency: "CNY",
        sales: 0,
        shopName: data.shopName,
        shopUrl: "",
        productUrl: url,
        imageUrl: undefined,
        isDropship: false,
      };
    } catch (err) {
      this.logger.error(`Product page scrape failed: ${err instanceof Error ? err.message : err}`);
      return null;
    } finally {
      await pageObj.close();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  getBrowser(): Browser | null {
    return this.browser;
  }

  getContext(): BrowserContext | null {
    return this.context;
  }
}
