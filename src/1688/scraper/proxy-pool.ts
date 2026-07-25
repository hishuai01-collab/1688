import { Logger } from "@nestjs/common";

/**
 * IP 代理池
 * 支持：
 * - 住宅代理 (Residential Proxy): BrightData, Oxylabs, IPRoyal, Soax 等
 * - 数据中心代理 (Datacenter Proxy)
 * - SOCKS5 代理
 * - 代理轮询 + 权重分配 + 故障转移
 */

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: "http" | "https" | "socks5" | "socks5h";
  weight?: number;
  lastUsed?: number;
  failCount?: number;
  provider?: string;
  region?: string;
}

export class ProxyPool {
  private readonly logger = new Logger(ProxyPool.name);
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;

  constructor() {
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    // 1. 住宅代理提供商（优先）
    this.loadResidentialProviders();

    // 2. 静态代理池
    const proxyPoolEnv = process.env.PROXY_POOL;
    if (proxyPoolEnv) {
      const urls = proxyPoolEnv.split(",").map((u) => u.trim()).filter(Boolean);
      const staticProxies = urls.map((url) => this.parseProxyUrl(url));
      this.proxies.push(...staticProxies);
    }

    // 3. 单个 HTTP 代理（后备）
    const singleProxy = process.env.HTTP_PROXY || process.env.https_proxy;
    if (singleProxy && this.proxies.length === 0) {
      this.proxies = [this.parseProxyUrl(singleProxy)];
    }

    if (this.proxies.length > 0) {
      this.logger.log(`Loaded ${this.proxies.length} proxies (${new Set(this.proxies.map(p => p.provider)).size} providers)`);
    }
  }

  private loadResidentialProviders(): void {
    // BrightData (formerly Luminati) 住宅代理
    const brightDataHost = process.env.BRIGHTDATA_HOST;
    const brightDataPort = parseInt(process.env.BRIGHTDATA_PORT || "22225");
    const brightDataUser = process.env.BRIGHTDATA_USER;
    const brightDataPass = process.env.BRIGHTDATA_PASS;
    if (brightDataHost && brightDataUser && brightDataPass) {
      this.proxies.push({
        host: brightDataHost,
        port: brightDataPort,
        username: brightDataUser,
        password: brightDataPass,
        protocol: "http",
        weight: 5,
        provider: "BrightData",
        region: process.env.BRIGHTDATA_REGION || "jp",
      });
      this.logger.log("BrightData residential proxy configured");
    }

    // Oxylabs 住宅代理
    const oxylabsUser = process.env.OXYLABS_USER;
    const oxylabsPass = process.env.OXYLABS_PASS;
    if (oxylabsUser && oxylabsPass) {
      const oxylabsCountry = process.env.OXYLABS_COUNTRY || "jp";
      this.proxies.push({
        host: "pr.oxylabs.io",
        port: 7777,
        username: `${oxylabsUser}-country-${oxylabsCountry}`,
        password: oxylabsPass,
        protocol: "http",
        weight: 5,
        provider: "Oxylabs",
      });
      this.logger.log("Oxylabs residential proxy configured");
    }

    // IPRoyal 住宅代理
    const iproyalUser = process.env.IPROYAL_USER;
    const iproyalPass = process.env.IPROYAL_PASS;
    if (iproyalUser && iproyalPass) {
      const iproyalCountry = process.env.IPROYAL_COUNTRY || "jp";
      this.proxies.push({
        host: "geo.iproyal.com",
        port: 12321,
        username: `${iproyalUser}_country-${iproyalCountry}`,
        password: iproyalPass,
        protocol: "http",
        weight: 5,
        provider: "IPRoyal",
      });
      this.logger.log("IPRoyal residential proxy configured");
    }

    // Soax 住宅代理
    const soaxUser = process.env.SOAX_USER;
    const soaxPass = process.env.SOAX_PASS;
    if (soaxUser && soaxPass) {
      const soaxCountry = process.env.SOAX_COUNTRY || "jp";
      this.proxies.push({
        host: "proxy.soax.com",
        port: 9137,
        username: `${soaxUser}-country-${soaxCountry}`,
        password: soaxPass,
        protocol: "socks5",
        weight: 5,
        provider: "Soax",
      });
      this.logger.log("Soax residential proxy configured");
    }

    // Smartproxy 住宅代理
    const smartproxyUser = process.env.SMARTPROXY_USER;
    const smartproxyPass = process.env.SMARTPROXY_PASS;
    if (smartproxyUser && smartproxyPass) {
      const smartproxyCountry = process.env.SMARTPROXY_COUNTRY || "jp";
      this.proxies.push({
        host: "gate.smartproxy.com",
        port: 7000,
        username: `${smartproxyUser}-country-${smartproxyCountry}`,
        password: smartproxyPass,
        protocol: "http",
        weight: 5,
        provider: "Smartproxy",
      });
      this.logger.log("Smartproxy residential proxy configured");
    }
  }

  private parseProxyUrl(url: string): ProxyConfig {
    try {
      const parsed = new URL(url);
      const proxy: ProxyConfig = {
        host: parsed.hostname,
        port: parseInt(parsed.port) || 8080,
        protocol: (parsed.protocol as "http" | "https") || "http",
        weight: 1,
        failCount: 0,
        provider: parsed.protocol?.includes("socks") ? "SOCKS5" : "Static",
      };
      if (parsed.username) {
        proxy.username = parsed.username;
        proxy.password = parsed.password || "";
      }
      return proxy;
    } catch (err) {
      this.logger.warn(`Failed to parse proxy URL: ${url}`);
      return { host: url, port: 8080, weight: 1, failCount: 0, provider: "Unknown" };
    }
  }

  getNextProxy(): ProxyConfig | null {
    if (this.proxies.length === 0) return null;
    const available = this.proxies.filter((p) => (p.failCount || 0) < 5);
    if (available.length === 0) {
      this.proxies.forEach((p) => (p.failCount = 0));
      return this.proxies[0];
    }
    const totalWeight = available.reduce((sum, p) => sum + (p.weight || 1), 0);
    let random = Math.random() * totalWeight;
    for (const proxy of available) {
      random -= proxy.weight || 1;
      if (random <= 0) {
        proxy.lastUsed = Date.now();
        this.currentIndex = this.proxies.indexOf(proxy);
        return proxy;
      }
    }
    const proxy = available[0];
    proxy.lastUsed = Date.now();
    return proxy;
  }

  getProxyServerString(proxy: ProxyConfig): string {
    if (proxy.username) {
      return `${proxy.protocol}://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`;
    }
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
  }

  markProxyFailed(proxy: ProxyConfig): void {
    const p = this.proxies.find((item) => item.host === proxy.host && item.port === proxy.port);
    if (p) {
      p.failCount = (p.failCount || 0) + 1;
      this.logger.warn(`Proxy ${p.provider || p.host}:${p.port} failed (count: ${p.failCount})`);
    }
  }

  markProxySuccess(proxy: ProxyConfig): void {
    const p = this.proxies.find((item) => item.host === proxy.host && item.port === proxy.port);
    if (p) {
      p.failCount = 0;
    }
  }

  hasProxies(): boolean {
    return this.proxies.length > 0;
  }

  getProxyCount(): number {
    return this.proxies.length;
  }
}
