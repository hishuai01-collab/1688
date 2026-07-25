import { randomInt } from "crypto";

/**
 * 指纹伪装工具
 * 模拟真实浏览器的各种指纹特征，避免被反爬虫检测
 */

export interface FingerprintOptions {
  viewport?: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  timezone?: string;
  deviceScaleFactor?: number;
  isMobile?: boolean;
}

export class FingerprintManager {
  private static readonly USER_AGENTS = [
    // iPhone
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    // Android
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    // Windows Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    // Mac Chrome
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ];

  private static readonly VIEWPORTS = [
    { width: 390, height: 844 }, // iPhone 12
    { width: 414, height: 896 }, // iPhone 11
    { width: 430, height: 932 }, // iPhone 14 Pro Max
    { width: 375, height: 812 }, // iPhone X
    { width: 412, height: 915 }, // Pixel 5
  ];

  private static readonly TIMEZONES = [
    "Asia/Shanghai",
    "Asia/Hong_Kong",
    "Asia/Tokyo",
    "Asia/Bangkok",
  ];

  private static readonly LOCALES = ["zh-CN", "zh-TW", "en-US"];

  /**
   * 生成随机指纹配置
   */
  static generateRandomFingerprint(): FingerprintOptions {
    const isMobile = randomInt(0, 2) === 0;
    const userAgent = isMobile
      ? this.USER_AGENTS[randomInt(0, 2)] // iPhone or Android
      : this.USER_AGENTS[randomInt(2, 4)]; // Windows or Mac

    return {
      viewport: isMobile
        ? this.VIEWPORTS[randomInt(0, this.VIEWPORTS.length)]
        : { width: 1920, height: 1080 },
      userAgent,
      locale: this.LOCALES[randomInt(0, this.LOCALES.length)],
      timezone: this.TIMEZONES[randomInt(0, this.TIMEZONES.length)],
      deviceScaleFactor: isMobile ? 2 + randomInt(0, 2) : 1,
      isMobile,
    };
  }

  /**
   * 生成 Playwright 启动选项
   */
  static getPlaywrightLaunchOptions(fingerprint: FingerprintOptions) {
    return {
      headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-dev-tools",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-images",
        `--user-agent=${fingerprint.userAgent}`,
      ],
    };
  }

  /**
   * 生成浏览器上下文选项
   */
  static getBrowserContextOptions(fingerprint: FingerprintOptions) {
    return {
      viewport: fingerprint.viewport,
      userAgent: fingerprint.userAgent,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      isMobile: fingerprint.isMobile,
      bypassCSP: true,
      javaScriptEnabled: true,
      acceptDownloads: false,
      // 伪装 webdriver
      extraHTTPHeaders: {
        "Accept-Language": fingerprint.locale === "zh-CN" ? "zh-CN,zh;q=0.9,en;q=0.8" : "en-US,en;q=0.9",
      },
    };
  }

  /**
   * 注入反检测脚本
   */
  static getStealthScript(fingerprint: FingerprintOptions): string {
    return `
      // 移除 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // 模拟 Chrome 对象
      window.chrome = {
        runtime: {},
        loadTimes: () => ({ start: 0, end: 0 }),
      };
      
      // 模拟插件
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // 模拟语言
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
      
      // 模拟权限
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (permissionObj) => {
          return Promise.resolve({
            state: 'granted',
            query: permissionObj,
          });
        };
      }
      
      // 模拟屏幕
      Object.defineProperty(screen, 'width', { get: () => ${fingerprint.viewport?.width || 390} });
      Object.defineProperty(screen, 'height', { get: () => ${fingerprint.viewport?.height || 844} });
      Object.defineProperty(screen, 'availWidth', { get: () => ${fingerprint.viewport?.width || 390} });
      Object.defineProperty(screen, 'availHeight', { get: () => ${fingerprint.viewport?.height || 844} - 60 });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      
      // 模拟时区偏移
      Date.prototype.getTimezoneOffset = () => -480; // UTC+8
      
      // 模拟 canvas 指纹
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attrs) {
        const ctx = originalGetContext.call(this, type, attrs);
        if (type === '2d') {
          const originalFillText = ctx.fillText;
          ctx.fillText = function(text, x, y) {
            // 添加微小随机偏移以模拟真实渲染
            const offset = Math.random() * 0.01;
            originalFillText.call(this, text, x + offset, y + offset);
          };
        }
        return ctx;
      };
    `;
  }
}
