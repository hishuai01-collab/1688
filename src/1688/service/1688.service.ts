import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma.service";
import { Scraper1688Service } from "../scraper/1688.scraper";
import { HeatScoringService } from "../score/heat.scorer";
import { RichPushService } from "../telegram/rich-push.service";
import { KeywordConfig, ScrapeResult, PushItem, RawProductItem } from "../dto/product.dto";

@Injectable()
export class Hot1688Service {
  private readonly logger = new Logger(Hot1688Service.name);
  private scanRunning = false;

  constructor(
    private readonly scraper: Scraper1688Service,
    private readonly scorer: HeatScoringService,
    private readonly prisma: PrismaService,
    private readonly pushService: RichPushService
  ) {}

  @Cron("0 */3 * * * *", { name: "1688-scan-cycle" })
  async runScanCycle(): Promise<void> {
    if (this.scanRunning) {
      this.logger.warn("Previous scan still running, skipping this cycle");
      return;
    }

    this.scanRunning = true;
    this.logger.log("1688 scan cycle started");
    const startTime = Date.now();

    try {
      const keywords = await this.prisma.keyword.findMany({
        where: { enabled: true },
      });

      if (keywords.length === 0) {
        this.logger.warn("No enabled keywords, skipping scan");
        return;
      }

      let totalNew = 0;
      let totalPushed = 0;

      for (const kw of keywords) {
        this.logger.debug(`Scanning keyword: ${kw.term}`);
        let result: ScrapeResult;

        try {
          result = await this.scraper.scrape({ keyword: kw.term, maxPages: 1 });
        } catch (err) {
          this.logger.error(
            `Scrape failed for "${kw.term}": ${err instanceof Error ? err.message : err}`
          );
          continue;
        }

        if (result.error) {
          this.logger.warn(`Scrape returned error for "${kw.term}": ${result.error}`);
        }

        const newCount = await this.upsertProducts(result.items);
        totalNew += newCount;

        const scored = await this.scorer.scoreProducts(result.items, kw.term);
        const pushThreshold = 30;
        const tierItems = this.scorer.tierItems(scored, pushThreshold);
        const filtered = await this.filterPushed(tierItems);

        if (filtered.length > 0) {
          const sent = await this.pushService.pushProducts(filtered, kw.term);
          totalPushed += sent.length;
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`Scan cycle done in ${elapsed}s | new=${totalNew} pushed=${totalPushed}`);
      await this.pushService.sendAdminReport({
        elapsed,
        keywords: keywords.length,
        newProducts: totalNew,
        pushed: totalPushed,
      });
    } catch (err) {
      this.logger.error(`Scan cycle failed: ${err instanceof Error ? err.message : err}`);
      await this.pushService.sendAdminMessage(
        `\u26a0\ufe0f 1688 scan cycle failed: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      this.scanRunning = false;
    }
  }

  async addKeyword(term: string): Promise<KeywordConfig> {
    const keyword = await this.prisma.keyword.upsert({
      where: { term },
      update: { enabled: true },
      create: { term },
    });
    return { term: keyword.term, enabled: keyword.enabled };
  }

  async removeKeyword(term: string): Promise<void> {
    await this.prisma.keyword.update({
      where: { term },
      data: { enabled: false },
    });
  }

  async getKeywords(): Promise<KeywordConfig[]> {
    const keywords = await this.prisma.keyword.findMany({
      orderBy: { created_at: "desc" },
    });
    return keywords.map((k) => ({ term: k.term, enabled: k.enabled }));
  }

  private async upsertProducts(items: RawProductItem[]): Promise<number> {
    let newCount = 0;
    for (const item of items) {
      try {
        const existing = await this.prisma.product.findUnique({
          where: { source_id: item.sourceId },
        });

        if (existing) {
          await this.prisma.product.update({
            where: { source_id: item.sourceId },
            data: {
              title: item.title,
              price: item.price,
              price_num: item.priceNum,
              sales: item.sales,
              shop_name: item.shopName,
              shop_url: item.shopUrl,
              product_url: item.productUrl,
              image_url: item.imageUrl,
              location: item.location,
              is_dropship: item.isDropship ?? false,
              last_seen_at: new Date(),
            },
          });
        } else {
          await this.prisma.product.create({
            data: {
              source_id: item.sourceId,
              title: item.title,
              price: item.price,
              price_num: item.priceNum,
              currency: item.currency,
              sales: item.sales,
              shop_name: item.shopName,
              shop_url: item.shopUrl,
              product_url: item.productUrl,
              image_url: item.imageUrl,
              category: item.category,
              location: item.location,
              is_dropship: item.isDropship ?? false,
              first_seen_at: new Date(),
              last_seen_at: new Date(),
            },
          });
          newCount++;
        }
      } catch (err) {
        this.logger.warn(
          `Upsert error ${item.sourceId}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    return newCount;
  }

  private async filterPushed(pushes: PushItem[]): Promise<PushItem[]> {
    const cooldownHours = 6;
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

    const filtered: PushItem[] = [];
    for (const p of pushes) {
      const product = await this.prisma.product.findUnique({
        where: { source_id: p.product.sourceId },
        select: { id: true, last_pushed_at: true },
      });

      if (!product) {
        filtered.push(p);
        continue;
      }

      if (!product.last_pushed_at || product.last_pushed_at < cutoff) {
        filtered.push(p);
      }
    }
    return filtered;
  }
}
