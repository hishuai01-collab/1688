import { version } from "../../package.json";

export const delay = parseInt(process.env.DELAY)
  ? parseInt(process.env.DELAY)
  : 120;

export const chatid = process.env.CHATID && parseInt(process.env.CHATID);
export const adminchatid =
  process.env.ADMIN_CHATID && parseInt(process.env.ADMIN_CHATID);

export const logLevel =
  process.env.DEBUG === "true"
    ? ["error", "warn", "debug", "log"]
    : ["error", "warn", "log"];

export const packageVersion = version ? version : "not_found";

// 可配置的 RSS 轮询间隔（毫秒），默认 300000ms（5 分钟）
export const pollInterval = parseInt(process.env.POLL_INTERVAL)
  ? parseInt(process.env.POLL_INTERVAL)
  : 300000;

// 关键词白名单：逗号分隔，留空表示不过滤
export const keywordWhitelist: string[] = process.env.KEYWORD_WHITELIST
  ? process.env.KEYWORD_WHITELIST.split(",").map((k) => k.trim()).filter(Boolean)
  : [];

// 关键词黑名单：逗号分隔，留空表示不过滤
export const keywordBlacklist: string[] = process.env.KEYWORD_BLACKLIST
  ? process.env.KEYWORD_BLACKLIST.split(",").map((k) => k.trim()).filter(Boolean)
  : [];

// 最大消息长度（Telegram 单条消息上限为 4096 字符）
export const maxMessageLength = 4000;

export const pushChatId = process.env.PUSH_CHAT_ID && parseInt(process.env.PUSH_CHAT_ID);
export const scanCron = process.env.SCAN_CRON || "0 */3 * * * *";
export const cooldownHours = parseInt(process.env.COOLDOWN_HOURS || "6");
export const pushThreshold = parseInt(process.env.PUSH_THRESHOLD || "30");
export const maxPages = parseInt(process.env.MAX_PAGES || "1");
