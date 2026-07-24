import { Injectable, Logger } from "@nestjs/common";
import { TelegramService } from "../../telegram/telegram.service";
import { PrismaService } from "../../prisma.service";
import { adminchatid } from "../../util/config";
import { PushItem } from "../dto/product.dto";

@Injectable()
export class RichPushService {
  private readonly logger = new Logger(RichPushService.name);
  private readonly pushChatId: number;

  constructor(
    private readonly telegramService: TelegramService,
    private readonly prisma: PrismaService
  ) {
    this.pushChatId = parseInt(process.env.PUSH_CHAT_ID || "0") || adminchatid || 0;
  }

  async pushProducts(items: PushItem[], keyword: string): Promise<PushItem[]> {
    if (!this.pushChatId) {
      this.logger.warn("No PUSH_CHAT_ID configured, skipping push");
      return [];
    }

    const sent: PushItem[] = [];
    for (const item of items) {
      try {
        await this.sendProductCard(this.pushChatId, item, keyword);
        sent.push(item);
        await this.markPushed(item);
      } catch (err) {
        this.logger.error(
          `Push failed ${item.product.sourceId}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    return sent;
  }

  async sendAdminMessage(text: string): Promise<void> {
    if (!adminchatid) return;
    try {
      await this.telegramService.sendRss(adminchatid, text);
    } catch {
      // silent
    }
  }

  async sendAdminReport(data: {
    elapsed: string;
    keywords: number;
    newProducts: number;
    pushed: number;
  }): Promise<void> {
    const msg =
      `📊 1688 扫描报告\n` +
      `⚡ 耗时: ${data.elapsed}s\n` +
      `🔍 关键词: ${data.keywords}\n` +
      `⭐ 新产品: ${data.newProducts}\n` +
      `📤 已推: ${data.pushed}`;
    await this.sendAdminMessage(msg);
  }

  private async sendProductCard(
    chatId: number,
    item: PushItem,
    keyword: string
  ): Promise<void> {
    const { product, tier, reason } = item;
    const tierLabel = `Tier ${tier}`;
    const tierEmoji = tier === "A" ? "🚀" : tier === "B" ? "🎯" : tier === "C" ? "📌" : "💡";

    const caption =
      `${tierEmoji} *${tierLabel}* | ${this.escapeMd(product.title.substring(0, 60))}\n\n` +
      `💰 *价格:* ${product.price} CNY\n` +
      `📊 *销量:* ${product.sales >= 1000 ? (product.sales / 1000).toFixed(1) + "k" : product.sales} 笔\n` +
      `🏪 *店铺:* ${this.escapeMd(product.shopName)}\n` +
      `💬 *推荐理由:* ${this.escapeMd(reason)}\n` +
      `🎯 *热度:* ${product.heatScore}/100\n\n` +
      `🔍 关键词: \`${this.escapeMd(keyword)}\`\n` +
      `🔗 [查看详情](${product.productUrl})`;

    if (product.imageUrl) {
      try {
        await this.telegramService.sendRss(chatId, caption);
        return;
      } catch {
        // fallback
      }
    }

    const textCard =
      `${tierEmoji} *${tierLabel}*\n\n` +
      `🛍️ *${this.escapeMd(product.title.substring(0, 80))}*\n\n` +
      `💰 价格: *${product.price}* CNY\n` +
      `📊 销量: *${product.sales}* 笔\n` +
      `🏪 店铺: ${this.escapeMd(product.shopName)}\n` +
      `💬 理由: ${this.escapeMd(reason)}\n` +
      `🎯 热度: *${product.heatScore}*/100\n\n` +
      `🔍 关键词: \`${this.escapeMd(keyword)}\`\n` +
      `🔗 [查看详情](${product.productUrl})`;

    await this.telegramService.sendRss(chatId, textCard);
  }

  private async markPushed(item: PushItem): Promise<void> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { source_id: item.product.sourceId },
        select: { id: true },
      });
      if (!product) return;

      const chatId = this.pushChatId;

      await this.prisma.product.update({
        where: { id: product.id },
        data: {
          push_count: { increment: 1 },
          last_pushed_at: new Date(),
        },
      });

      await this.prisma.push_log.create({
        data: {
          product_id: product.id,
          chat_id: chatId,
          score: item.product.heatScore,
        },
      });
    } catch (err) {
      this.logger.warn(`markPushed error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private escapeMd(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
  }
}
