import { Injectable, Logger } from "@nestjs/common";
import { RawProductItem } from "../dto/product.dto";

/**
 * 1688 内部 JSON API 客户端
 *
 * 逆向 1688 的 mtop 接口，直接调用内部 API 获取数据
 * 比解析 HTML 更稳定、速度更快
 *
 * 核心接口：
 * - mtop.1688.offer.search: 搜索商品列表
 * - mtop.1688.offer.detail: 商品详情
 * - mtop.1688.seller.list: 商家商品列表
 */

export interface ApiSearchResult {
  items: RawProductItem[];
  totalCount: number;
  hasMore: boolean;
}

export interface ApiClientConfig {
  cookieJar: Map<string, string>;
  userAgent: string;
  proxyUrl?: string;
}

@Injectable()
export class AlibabaApiClient {
  private readonly logger = new Logger(AlibabaApiClient.name);
  private readonly baseHeaders: Record<string, string>;
  private cookieJar: Map<string, string> = new Map();
  private userAgent: string;
  private proxyUrl?: string;

  constructor() {
    this.userAgent =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

    this.baseHeaders = {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "x-umt-trace": "",
      "x-pv": "6.3",
      "x-features": "27",
      "x-mini-wua": "",
      "x-ttid": "10000100@alibaba_1688_7.0.0",
      "x-devid": this.generateDeviceId(),
      "x-nettype": "WIFI",
      "x-uid": "",
      "x-utdid": this.generateUtdid(),
      "x-appkey": "12574478", // 1688 App Key
      "x-sgext": "",
      "x-ut": "0",
    };
  }

  /**
   * 通过 mtop API 搜索商品
   * 接口: mtop.1688.offer.search
   */
  async searchByApi(
    keyword: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<ApiSearchResult> {
    const api = "mtop.1688.offer.search";
    const version = "1.0";
    const data = JSON.stringify({
      q: keyword,
      beginPage: page,
      pageSize,
      searchType: "p",
      sortType: "default",
      descOrder: "false",
      source: "PC_INDEX",
      spm: "a260k.22420097.1001.1",
    });

    const params = this.buildMtopParams(api, version, data);
    const url = `https://h5api.m.1688.com/h5/mtop.1688.offer.search/1.0/?${params}`;

    try {
      const response = await this.request(url, {
        method: "GET",
        headers: {
          ...this.baseHeaders,
          Referer: "https://m.1688.com/",
          "x-ttid": "10000100@alibaba_1688_7.0.0",
        },
      });

      return this.parseSearchResponse(response, keyword);
    } catch (err) {
      this.logger.warn(
        `API search failed for "${keyword}": ${
          err instanceof Error ? err.message : err
        }`,
      );
      return { items: [], totalCount: 0, hasMore: false };
    }
  }

  /**
   * 通过 mtop API 获取商品详情
   * 接口: mtop.1688.offer.detail
   */
  async getProductDetailByApi(offerId: string): Promise<RawProductItem | null> {
    const api = "mtop.1688.offer.detail";
    const version = "1.0";
    const data = JSON.stringify({
      offerId,
      spm: "a260k.22420097.1001.1",
    });

    const params = this.buildMtopParams(api, version, data);
    const url = `https://h5api.m.1688.com/h5/mtop.1688.offer.detail/1.0/?${params}`;

    try {
      const response = await this.request(url, {
        method: "GET",
        headers: {
          ...this.baseHeaders,
          Referer: `https://detail.1688.com/offer/${offerId}.html`,
        },
      });

      return this.parseDetailResponse(response, offerId);
    } catch (err) {
      this.logger.warn(
        `API detail failed for offer ${offerId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return null;
    }
  }

  /**
   * 构建 mtop 请求参数（含签名）
   * mtop 的签名算法基于 data + appKey + timestamp
   */
  private buildMtopParams(api: string, version: string, data: string): string {
    const timestamp = Date.now().toString();
    const appKey = "12574478";
    const t = timestamp;
    const sign = this.generateMtopSign(api, version, data, t, appKey);

    const params = new URLSearchParams({
      jsv: "2.6.1",
      appKey,
      t,
      sign,
      api,
      v: version,
      type: "originaljson",
      dataType: "json",
      data,
      "x-ttid": "10000100@alibaba_1688_7.0.0",
      "x-devid": this.generateDeviceId(),
      "x-utdid": this.generateUtdid(),
      "x-nettype": "WIFI",
      "x-pv": "6.3",
      "x-features": "27",
      "x-uid": "",
      "x-umt-trace": "",
      "x-mini-wua": "",
      "x-sgext": "",
      "x-ut": "0",
    });

    return params.toString();
  }

  /**
   * 生成 mtop 签名
   * 简化版签名：md5(api + version + appKey + data + t + token)
   * 实际签名算法更复杂，这里使用简化版本
   */
  private generateMtopSign(
    api: string,
    version: string,
    data: string,
    t: string,
    appKey: string,
  ): string {
    // 简化签名：实际需要逆向完整的 mtop 签名算法
    // 这里使用 SHA256 模拟
    const crypto = require("crypto");
    const signStr = `${api}&${version}&${appKey}&${data}&${t}`;
    return crypto
      .createHash("sha256")
      .update(signStr)
      .digest("hex")
      .substring(0, 32);
  }

  /**
   * 生成设备 ID
   */
  private generateDeviceId(): string {
    const chars = "abcdef0123456789";
    let id = "";
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        id += "-";
      } else {
        id += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return id;
  }

  /**
   * 生成 UTDID
   */
  private generateUtdid(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let utdid = "";
    for (let i = 0; i < 24; i++) {
      utdid += chars[Math.floor(Math.random() * chars.length)];
    }
    return utdid;
  }

  /**
   * 发送 HTTP 请求
   */
  private async request(url: string, options: RequestInit): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const fetchOptions: any = {
        ...options,
        signal: controller.signal,
      };

      // 添加 Cookie
      if (this.cookieJar.size > 0) {
        const cookieStr = Array.from(this.cookieJar.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        fetchOptions.headers = {
          ...fetchOptions.headers,
          Cookie: cookieStr,
        };
      }

      // 添加代理
      if (this.proxyUrl) {
        // 通过环境变量代理
        process.env.HTTP_PROXY = this.proxyUrl;
        process.env.HTTPS_PROXY = this.proxyUrl;
      }

      const response = await fetch(url, fetchOptions);

      // 保存 Cookie
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        setCookie.split(",").forEach((cookie) => {
          const match = cookie.match(/^([^=]+)=([^;]+)/);
          if (match) {
            this.cookieJar.set(match[1], match[2]);
          }
        });
      }

      const text = await response.text();

      // 解析 mtop 返回格式: { ret: ["SUCCESS::调用成功"], data: {...} }
      try {
        const parsed = JSON.parse(text);
        if (parsed.ret) {
          const retStr = parsed.ret[0] || "";
          if (retStr.startsWith("SUCCESS")) {
            return parsed.data || parsed;
          }
          this.logger.warn(`API returned error: ${retStr}`);
          return null;
        }
        return parsed;
      } catch {
        return text;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 解析搜索响应
   */
  private parseSearchResponse(response: any, keyword: string): ApiSearchResult {
    if (!response) {
      return { items: [], totalCount: 0, hasMore: false };
    }

    // mtop 返回格式可能有多层嵌套
    const data = response.data || response.result || response;
    const offerList =
      data.offerList || data.list || data.items || data.offers || [];
    const totalCount = data.totalCount || data.total || offerList.length || 0;

    const items: RawProductItem[] = offerList.map((offer: any) => ({
      sourceId: String(offer.offerId || offer.id || ""),
      title: (offer.title || offer.subject || keyword).substring(0, 120),
      price:
        offer.price?.priceText ||
        offer.priceText ||
        `¥${offer.price?.originalPrice || "0"}`,
      priceNum: parseFloat(offer.price?.originalPrice || offer.price || "0"),
      currency: "CNY",
      sales: offer.salesCount || offer.sales || offer.tradeCount || 0,
      shopName:
        offer.companyName || offer.shopName || offer.sellerName || "未知商家",
      shopUrl: offer.shopUrl || offer.shopURL || "",
      productUrl: `https://detail.1688.com/offer/${
        offer.offerId || offer.id
      }.html`,
      imageUrl:
        offer.imageUrl || offer.imgUrl || offer.picUrl || offer.image?.imgUrl,
      category: offer.categoryName || offer.category,
      location: offer.city || offer.location || offer.address,
      isDropship: offer.isDropship || offer.supportMix || false,
    }));

    return {
      items,
      totalCount,
      hasMore: items.length >= 20,
    };
  }

  /**
   * 解析详情响应
   */
  private parseDetailResponse(
    response: any,
    offerId: string,
  ): RawProductItem | null {
    if (!response) return null;

    const data = response.data || response.result || response;
    const offer = data.offer || data;

    return {
      sourceId: offerId,
      title: (offer.title || offer.subject || "").substring(0, 120),
      price: offer.price?.priceText || `¥${offer.price?.originalPrice || "0"}`,
      priceNum: parseFloat(offer.price?.originalPrice || offer.price || "0"),
      currency: "CNY",
      sales: offer.salesCount || offer.tradeCount || 0,
      shopName: offer.companyName || offer.shopName || "未知商家",
      shopUrl: offer.shopUrl || "",
      productUrl: `https://detail.1688.com/offer/${offerId}.html`,
      imageUrl: offer.imageUrl || offer.imgUrl || offer.image?.imgUrl,
      category: offer.categoryName,
      location: offer.city || offer.location,
      isDropship: offer.isDropship || false,
    };
  }

  /**
   * 设置 Cookie
   */
  setCookies(cookies: Map<string, string>): void {
    this.cookieJar = cookies;
  }

  /**
   * 设置代理
   */
  setProxy(proxyUrl: string): void {
    this.proxyUrl = proxyUrl;
  }

  /**
   * 获取当前 Cookie
   */
  getCookies(): Map<string, string> {
    return this.cookieJar;
  }
}
