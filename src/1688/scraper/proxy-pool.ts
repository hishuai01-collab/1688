import { Logger } from "@nestjs/common";

/**
 * IP 代理池
 * 管理多个代理 IP，实现轮询和故障转移
 */

export interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: "http" | "https";
  weight?: number;
  lastUsed?: number;
  failCount?: number;
}

export class ProxyPool {
  private readonly logger = new Logger(ProxyPool.name);
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;

  constructor() {
    this.loadFromEnv();
  }

  private loadFromEnv(): void {
    const proxyPoolEnv = process.env.PROXY_POOL;
    if (proxyPoolEnv) {
      const urls = proxyPoolEnv.split(",").map((u) => u.trim()).filter(Boolean);
      this.proxies = urls.map((url) => this.parseProxyUrl(url));
    }

    const singleProxy = process.env.HTTP_PROXY || process.env.https_proxy;
    if (singleProxy && this.proxies.length === 0) {
      this.proxies = [this.parseProxyUrl(singleProxy)];
    }

    if (this.proxies.length > 0) {
      this.logger.log(`Loaded ${this.proxies.length} proxies from environment`);
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
      };
      if (parsed.username) {
        proxy.username = parsed.username;
        proxy.password = parsed.password || "";
      }
      return proxy;
    } catch (err) {
      this.logger.warn(`Failed to parse proxy URL: ${url}`);
      return { host: url, port: 8080, weight: 1, failCount: 0 };
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
      this.logger.warn(`Proxy ${p.host}:${p.port} failed (count: ${p.failCount})`);
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
