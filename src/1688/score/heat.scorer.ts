import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { RawProductItem, ScoreResult, PushItem, PushTier } from "../dto/product.dto";

@Injectable()
export class HeatScoringService {
  private readonly logger = new Logger(HeatScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  private readonly rules = {
    salesScale: (s: number) =>
      s >= 1000 ? 40 : s >= 500 ? 30 : s >= 100 ? 20 : s >= 10 ? 10 : 0,
    trendWeight: 0.25,
    priceSignal: (delta: number) => (delta > 0 ? 5 : delta < -0.1 ? -3 : 0),
    sellerWeight: (name: string) => (name.length >= 2 && name !== "未知商家" ? 5 : 0),
    dropshipBonus: 8,
    tierA: 65,
    tierB: 45,
    tierC: 25,
  };

  async scoreProducts(items: RawProductItem[], keyword: string): Promise<ScoreResult[]> {
    const results: ScoreResult[] = [];

    for (const item of items) {
      const existing = await this.getLastSnapshot(item.sourceId);

      const salesScore = this.rules.salesScale(item.sales);
      const salesDelta = existing ? item.sales - existing.sales : 0;
      const trendScore = Math.min(25, Math.round(salesDelta * this.rules.trendWeight));
      const priceDelta = existing ? item.priceNum - existing.price : 0;
      const priceScore = this.rules.priceSignal(priceDelta);
      const sellerScore = this.rules.sellerWeight(item.shopName);
      const dropshipBonus = item.isDropship ? this.rules.dropshipBonus : 0;

      const heatScore = Math.max(0, Math.min(100, salesScore + trendScore + priceScore + sellerScore + dropshipBonus));

      const scoreResult: ScoreResult = {
        productId: 0,
        sourceId: item.sourceId,
        title: item.title,
        heatScore: Math.round(heatScore * 10) / 10,
        price: item.price,
        sales: item.sales,
        shopName: item.shopName,
        productUrl: item.productUrl,
        imageUrl: item.imageUrl,
        components: {
          salesScore,
          trendScore,
          priceScore,
          sellerScore,
          dropshipBonus,
        },
      };

      results.push(scoreResult);
      await this.saveSnapshot(item, heatScore);
    }

    results.sort((a, b) => b.heatScore - a.heatScore);
    this.logger.debug(
      `Scored ${results.length} items for keyword=${keyword}. ` +
        `Top=${results[0]?.heatScore ?? 0}, min=${results[results.length - 1]?.heatScore ?? 0}`
    );
    return results;
  }

  tierItems(scored: ScoreResult[], pushThreshold: number): PushItem[] {
    const pushes: PushItem[] = [];
    for (const s of scored) {
      if (s.heatScore < pushThreshold) continue;
      const tier: PushTier =
        s.heatScore >= this.rules.tierA
          ? "A"
          : s.heatScore >= this.rules.tierB
          ? "B"
          : s.heatScore >= this.rules.tierC
          ? "C"
          : "D";
      const reason = this.buildReason(s);
      pushes.push({ tier, product: s, reason });
    }
    return pushes;
  }

  private async getLastSnapshot(sourceId: string): Promise<{
    price: number;
    sales: number;
    created_at: Date;
  } | null> {
    try {
      const snapshot = await this.prisma.product_snapshot.findFirst({
        where: { product: { source_id: sourceId } },
        orderBy: { created_at: "desc" },
        select: { price: true, sales: true, created_at: true },
      });
      return snapshot;
    } catch {
      return null;
    }
  }

  private async saveSnapshot(item: RawProductItem, heatScore: number): Promise<void> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { source_id: item.sourceId },
        select: { id: true },
      });
      if (!product) return;

      await this.prisma.product_snapshot.create({
        data: {
          product_id: product.id,
          price: item.priceNum,
          sales: item.sales,
          heat_score: heatScore,
        },
      });
    } catch (err) {
      this.logger.warn(`Snapshot save failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private buildReason(s: ScoreResult): string {
    const parts: string[] = [];
    if (s.components.salesScore >= 30) parts.push(`销量爆发(${s.sales}笔)`);
    if (s.components.trendScore > 0) parts.push("热度上升");
    if (s.components.priceScore > 0) parts.push("价格上涨信号");
    if (s.components.dropshipBonus > 0) parts.push("支持一件代发");
    return parts.length > 0 ? parts.join(" + ") : "综合热度达标";
  }
}
