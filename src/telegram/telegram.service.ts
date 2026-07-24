import { Injectable } from "@nestjs/common";
import { InjectBot } from "nestjs-telegraf";
import { adminchatid, maxMessageLength } from "../util/config";
import { Telegraf } from "telegraf";
import { InjectEventEmitter } from "nest-emitter";
import { EventEmitterType } from "../events";
import mdLoader from "../util/mdLoader";
import { Item } from "rss-parser";

@Injectable()
export class TelegramService {
  constructor(
    @InjectBot() private bot: Telegraf<any>,
    @InjectEventEmitter()
    private readonly eventEmitter: EventEmitterType
  ) {}

  async onApplicationBootstrap() {
    const commands = (await mdLoader("help"))
      .split("\n")
      .map((line: string) => {
        if (line.startsWith("*/")) {
          const command = line.replace("* ", "*/ ").split("*/");
          const description = line.split("* ");
          return { command: command[1], description: description[1] };
        }
      })
      .filter((anyValue) => typeof anyValue !== "undefined");

    await this.bot.telegram.setMyCommands(commands);
  }

  async sendRss(chatId: number, link: string) {
    try {
      await this.bot.telegram.sendMessage(chatId, link);
    } catch (error) {
      if (error.response.error_code === 429) {
        throw error;
      }
      if (
        error.response.error_code === 403 ||
        error.description === "Bad Request: chat not found"
      ) {
        this.eventEmitter.emit("disableAllFeeds", {
          chatId: chatId,
          disable: true
        });
        return await this.sendAdminMessage("Disabling all feeds for " + chatId);
      } else if (error.response.parameters?.migrate_to_chat_id) {
        const newChatId = error.response.parameters.migrate_to_chat_id;
        this.eventEmitter.emit("migrateChat", {
          chatId: chatId,
          newChatId: newChatId
        });
        await this.sendAdminMessage(
          `Migrated chat from ${chatId} to ${newChatId}`
        );
      } else {
        await this.sendAdminMessage(JSON.stringify(error));
      }
    }
  }

  /**
   * 发送格式化的 RSS 条目到 Telegram
   * - 自动排版标题、内容、发布时间、链接
   * - 自动拆分长消息（Telegram 单条消息上限 4096 字符）
   * - 支持 Markdown 格式
   */
  async sendFeedItem(chatId: number, item: Item) {
    try {
      const title = item.title || "无标题";
      const link = item.link || "";
      const pubDate = item.pubDate
        ? new Date(item.pubDate).toLocaleString("zh-CN", {
            timeZone: "Asia/Bangkok",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          })
        : "";

      // 提取纯文本内容（去除 HTML 标签）
      let content = "";
      if (item.content) {
        content = item.content.replace(/<[^>]*>/g, "").trim();
      } else if (item.contentSnippet) {
        content = item.contentSnippet.trim();
      }

      // 构建消息体
      let message = `*${this.escapeMarkdown(title)}*\n`;
      if (pubDate) {
        message += `_发布时间: ${pubDate}_\n`;
      }
      if (content) {
        message += `\n${this.escapeMarkdown(content)}\n`;
      }
      message += `\n🔗 ${link}`;

      // 自动拆分长消息
      const chunks = this.splitMessage(message, maxMessageLength);

      for (const chunk of chunks) {
        await this.bot.telegram.sendMessage(chatId, chunk, {
          parse_mode: "Markdown",
          disable_web_page_preview: false
        });
      }
    } catch (error) {
      if (error.response?.error_code === 429) {
        throw error;
      }
      if (
        error.response?.error_code === 403 ||
        error.description === "Bad Request: chat not found"
      ) {
        this.eventEmitter.emit("disableAllFeeds", {
          chatId: chatId,
          disable: true
        });
        return await this.sendAdminMessage("Disabling all feeds for " + chatId);
      } else if (error.response?.parameters?.migrate_to_chat_id) {
        const newChatId = error.response.parameters.migrate_to_chat_id;
        this.eventEmitter.emit("migrateChat", {
          chatId: chatId,
          newChatId: newChatId
        });
        await this.sendAdminMessage(
          `Migrated chat from ${chatId} to ${newChatId}`
        );
      } else {
        await this.sendAdminMessage(JSON.stringify(error));
      }
    }
  }

  /**
   * 转义 Markdown 特殊字符，避免格式错误
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!]/g, "\\$&");
  }

  /**
   * 将长消息拆分成多个块，每块不超过指定长度
   * 尝试在换行符处分割，以保持格式完整性
   */
  private splitMessage(message: string, maxLength: number): string[] {
    if (message.length <= maxLength) {
      return [message];
    }

    const chunks: string[] = [];
    let current = "";

    const lines = message.split("\n");

    for (const line of lines) {
      if (current.length + line.length + 1 > maxLength) {
        if (current) {
          chunks.push(current);
          current = "";
        }
        // 如果单行就超过长度，强制分割
        if (line.length > maxLength) {
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.slice(i, i + maxLength));
          }
        } else {
          current = line;
        }
      } else {
        current += current ? "\n" + line : line;
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  async sendAdminMessage(msg: string) {
    if (!adminchatid) return;
    await this.sendRss(adminchatid, msg);
  }
}
