import { Logger } from "@nestjs/common";
import { Page } from "playwright";

/**
 * 验证码/滑块处理
 * 检测并处理 1688 页面上的验证码和滑块验证
 */

export interface CaptchaResult {
  handled: boolean;
  type?: "slider" | "input" | "unknown";
  message?: string;
}

export class CaptchaHandler {
  private readonly logger = new Logger(CaptchaHandler.name);

  async detectCaptcha(page: Page): Promise<boolean> {
    try {
      const slider = await page.$('.nc_wrapper, .nc-lang-cnt, #nc_1_n1, .nc-module, [id*="nc_"]', { state: "attached" }).catch(() => null);
      if (slider) {
        this.logger.warn("Detected slider CAPTCHA");
        return true;
      }

      const inputCaptcha = await page.$('input[name="captcha"], .captcha-input, [id*="captcha"]', { state: "attached" }).catch(() => null);
      if (inputCaptcha) {
        this.logger.warn("Detected input CAPTCHA");
        return true;
      }

      const iframes = await page.$$('iframe[src*="captcha"], iframe[src*="slide"], iframe[id*="captcha"]', { state: "attached" }).catch(() => []);
      if (iframes && iframes.length > 0) {
        this.logger.warn(`Detected ${iframes.length} CAPTCHA iframes`);
        return true;
      }

      const captchaImg = await page.$('.captcha-img, [id*="captcha_img"], [class*="verify_code"]', { state: "attached" }).catch(() => null);
      if (captchaImg) {
        this.logger.warn("Detected image CAPTCHA");
        return true;
      }

      return false;
    } catch (err) {
      this.logger.debug(`Captcha detection error: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  async handleCaptcha(page: Page): Promise<CaptchaResult> {
    try {
      const hasCaptcha = await this.detectCaptcha(page);
      if (!hasCaptcha) {
        return { handled: false, message: "No CAPTCHA detected" };
      }

      const sliderResult = await this.handleSlider(page);
      if (sliderResult.handled) {
        return sliderResult;
      }

      const inputResult = await this.handleInputCaptcha(page);
      if (inputResult.handled) {
        return inputResult;
      }

      return {
        handled: false,
        type: "unknown",
        message: "Unable to handle CAPTCHA automatically",
      };
    } catch (err) {
      this.logger.error(`CAPTCHA handling failed: ${err instanceof Error ? err.message : err}`);
      return {
        handled: false,
        type: "unknown",
        message: `Error: ${err instanceof Error ? err.message : err}`,
      };
    }
  }

  private async handleSlider(page: Page): Promise<CaptchaResult> {
    try {
      const sliderSelectors = [
        '.nc_wrapper .nc_bg, #nc_1_n1, .nc-module .slider',
        '[id*="nc_"] .nc_bg, [id*="nc_"] .slider',
        '.nc-lang-cnt .nc_bg',
        '.J_NC_Btn, .nc-btn, [class*="slider"]',
      ];

      let sliderHandle: any = null;
      for (const selector of sliderSelectors) {
        try {
          sliderHandle = await page.$(selector, { state: "attached" });
          if (sliderHandle) break;
        } catch {
          continue;
        }
      }

      if (!sliderHandle) {
        return { handled: false };
      }

      const sliderBox = await sliderHandle.boundingBox();
      if (!sliderBox) {
        return { handled: false };
      }

      let trackHandle: any = null;
      const trackSelectors = [
        '.nc_wrapper .nc_bg, #nc_1_n1, .nc-module .nc_bg',
        '[id*="nc_"] .nc_bg',
        '.nc-lang-cnt .nc_bg',
        '[class*="track"]',
      ];

      for (const selector of trackSelectors) {
        try {
          trackHandle = await page.$(selector, { state: "attached" });
          if (trackHandle) break;
        } catch {
          continue;
        }
      }

      if (!trackHandle) {
        return { handled: false, type: "slider" };
      }

      const trackBox = await trackHandle.boundingBox();
      if (!trackBox) {
        return { handled: false, type: "slider" };
      }

      const startX = trackBox.x + trackBox.width / 2;
      const startY = trackBox.y + trackBox.height / 2;
      const endX = startX + trackBox.width - 20;
      const endY = startY;

      await page.mouse.move(startX, startY);
      await page.mouse.down();

      const steps = 30;
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const jitterY = (Math.random() - 0.5) * 5;
        const jitterX = (Math.random() - 0.5) * 2;
        const x = startX + (endX - startX) * progress + jitterX;
        const y = startY + jitterY;
        await page.mouse.move(x, y);
        await page.waitForTimeout(10 + Math.random() * 20);
      }

      await page.mouse.up();
      await page.waitForTimeout(2000);

      const passed = await this.checkSliderPassed(page);
      if (passed) {
        this.logger.log("Slider CAPTCHA handled successfully");
        return { handled: true, type: "slider", message: "Slider verified" };
      }

      return { handled: false, type: "slider", message: "Slider verification failed" };
    } catch (err) {
      this.logger.warn(`Slider handling error: ${err instanceof Error ? err.message : err}`);
      return { handled: false, type: "slider", message: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkSliderPassed(page: Page): Promise<boolean> {
    try {
      const passedSelectors = [
        '.nc-bg_item.nc_bg_hompage, .nc_bg_suksess, .nc-success',
        '.nc-lang-cnt .nc-bg_item, [class*="success"]',
        '.nc-wrapper .nc-bg_item, [class*="passed"]',
      ];

      for (const selector of passedSelectors) {
        try {
          const element = await page.$(selector, { state: "attached" });
          if (element) return true;
        } catch {
          continue;
        }
      }

      const sliderExists = await page.$('.nc_wrapper, #nc_1_n1, [class*="nc_"]', { state: "attached" }).catch(() => null);
      if (!sliderExists) return true;

      return false;
    } catch {
      return false;
    }
  }

  private async handleInputCaptcha(page: Page): Promise<CaptchaResult> {
    try {
      const inputHandle = await page.$('input[name="captcha"], .captcha-input, [id*="captcha"]', { state: "attached" });
      if (!inputHandle) {
        return { handled: false };
      }

      this.logger.warn("Input CAPTCHA detected but no OCR service configured");
      return {
        handled: false,
        type: "input",
        message: "Input CAPTCHA requires manual handling or OCR service",
      };
    } catch (err) {
      return { handled: false, type: "input", message: err instanceof Error ? err.message : String(err) };
    }
  }

  async refreshCaptcha(page: Page): Promise<boolean> {
    try {
      const refreshSelectors = [
        '.nc-reload, .refresh, [class*="reload"], [class*="refresh"]',
        '.captcha-refresh, .change-code, [id*="refresh"]',
        '.nc_wrapper .nc-reload, #nc_1_n1_reload',
      ];

      for (const selector of refreshSelectors) {
        try {
          const element = await page.$(selector, { state: "attached" });
          if (element) {
            await element.click();
            await page.waitForTimeout(1000);
            this.logger.log("CAPTCHA refreshed");
            return true;
          }
        } catch {
          continue;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  async waitForCaptchaClear(page: Page, timeoutMs: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const hasCaptcha = await this.detectCaptcha(page);
      if (!hasCaptcha) return true;
      await page.waitForTimeout(500);
    }
    return false;
  }
}
