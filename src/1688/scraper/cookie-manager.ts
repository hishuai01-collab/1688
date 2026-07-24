import * as fs from "fs";
import * as path from "path";
import { Logger } from "@nestjs/common";

/**
 * Cookie 持久化管理
 * 保存和加载浏览器 Cookie，维持登录状态
 */

export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export class CookieManager {
  private readonly logger = new Logger(CookieManager.name);
  private readonly cookieFile: string;

  constructor(cookieDir: string = "./config") {
    this.cookieFile = path.join(cookieDir, "1688_cookies.json");
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
    }
  }

  saveCookies(cookies: Cookie[]): void {
    try {
      const now = Date.now() / 1000;
      const validCookies = cookies.filter((c) => !c.expires || c.expires > now);
      fs.writeFileSync(this.cookieFile, JSON.stringify(validCookies, null, 2), "utf-8");
      this.logger.debug(`Saved ${validCookies.length} cookies to ${this.cookieFile}`);
    } catch (err) {
      this.logger.warn(`Failed to save cookies: ${err instanceof Error ? err.message : err}`);
    }
  }

  loadCookies(): Cookie[] {
    try {
      if (!fs.existsSync(this.cookieFile)) {
        return [];
      }
      const data = fs.readFileSync(this.cookieFile, "utf-8");
      const cookies: Cookie[] = JSON.parse(data);
      const now = Date.now() / 1000;
      return cookies.filter((c) => !c.expires || c.expires > now);
    } catch (err) {
      this.logger.warn(`Failed to load cookies: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  clearCookies(): void {
    try {
      if (fs.existsSync(this.cookieFile)) {
        fs.unlinkSync(this.cookieFile);
      }
    } catch (err) {
      this.logger.warn(`Failed to clear cookies: ${err instanceof Error ? err.message : err}`);
    }
  }

  fromPlaywrightCookies(playwrightCookies: any[]): Cookie[] {
    return playwrightCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));
  }

  toPlaywrightCookies(cookies: Cookie[]): any[] {
    return cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || "1688.com",
      path: c.path || "/",
      expires: c.expires,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: c.sameSite || "Lax",
    }));
  }
}
