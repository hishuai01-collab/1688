# RSS-to-Telegram-Bot v2.0.9 部署教程

本教程将指导您使用 Docker Compose 部署 RSS-to-Telegram-Bot v2.0.9，包括 Redis 服务、HTTP 代理支持、可配置轮询间隔和关键词过滤功能。

## 环境要求

- Docker 20.10+
- Docker Compose 1.29+
- 至少 512MB 可用内存

## 快速部署

### 1. 克隆项目

```bash
git clone <项目仓库地址>
cd RSS-to-Telegram-Bot
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并编辑：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入必要的配置：

```bash
# Telegram Bot 配置
TOKEN=your-telegram-bot-token-here
CHATID=-123456789
# ADMIN_CHATID=-987654321  # 可选：管理员聊天 ID，用于接收错误通知

# 调试模式（true 时输出 debug 日志）
DEBUG=false

# Redis 配置
REDIS_HOST=redis
REDIS_PORT=6379
# REDIS_PASSWORD=your-redis-password
# REDIS_USER=default

# 可配置的 RSS 轮询间隔（毫秒），默认 300000ms（5 分钟）
POLL_INTERVAL=300000

# 关键词白名单：逗号分隔，留空表示不过滤
# 示例：KEYWORD_WHITELIST=手机,电脑,耳机
KEYWORD_WHITELIST=

# 关键词黑名单：逗号分隔，留空表示不过滤
# 示例：KEYWORD_BLACKLIST=广告, spam
KEYWORD_BLACKLIST=

# HTTP 代理配置（可选，用于访问受限网络如泰国）
# 格式：http://username:password@host:port
# HTTP_PROXY=http://proxy.example.com:8080
# HTTPS_PROXY=http://proxy.example.com:8080
# NO_PROXY=localhost,127.0.0.1

# 开发聊天 ID（用于调试）
# DEV_CHAT=123456789
```

### 3. 启动服务

```bash
docker compose up -d
```

### 4. 查看日志

```bash
# 查看所有服务日志
docker compose logs -f

# 查看 Bot 日志
docker compose logs -f bot

# 查看 Redis 日志
docker compose logs -f redis
```

### 5. 验证部署

```bash
# 检查容器状态
docker compose ps

# 检查 Redis 健康状态
docker compose exec redis redis-cli ping
```

## 配置说明

### Telegram Bot 配置

| 参数 | 说明 | 必填 |
|------|------|------|
| `TOKEN` | Telegram Bot 的 Token，通过 @BotFather 获取 | 是 |
| `CHATID` | 默认聊天 ID，用于多聊天迁移 | 否 |
| `ADMIN_CHATID` | 管理员聊天 ID，用于接收错误通知 | 否 |

### Redis 配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `REDIS_HOST` | Redis 主机地址 | `redis` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `REDIS_PASSWORD` | Redis 密码（如需认证） | 空 |
| `REDIS_USER` | Redis 用户名（如需认证） | 空 |

### RSS 轮询配置

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `POLL_INTERVAL` | RSS 轮询间隔（毫秒） | `300000`（5 分钟） |

### 关键词过滤

- **白名单**：当设置白名单时，只有标题或内容包含至少一个白名单关键词的 RSS 条目才会被推送。
- **黑名单**：当设置黑名单时，标题或内容包含任何黑名单关键词的 RSS 条目会被过滤。
- 多个关键词使用逗号分隔。
- 留空表示不进行过滤。

### HTTP 代理配置

如果您的服务器无法直接访问 RSS 源（如泰国网络限制），可以配置 HTTP 代理：

```bash
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=http://proxy.example.com:8080
NO_PROXY=localhost,127.0.0.1
```

代理格式支持用户名密码认证：`http://username:password@host:port`

## 数据持久化

Docker Compose 配置了两个持久化卷：

- `redis-data`：Redis 数据卷，存储队列和缓存数据
- `bot-config`：Bot 配置卷，存储 SQLite 数据库文件

这些卷位于 Docker 的数据目录中，容器重启不会丢失数据。

## 常见问题

### 1. 容器无法启动

检查 `.env` 文件是否正确配置， especially `TOKEN` 和 `CHATID`。

```bash
docker compose logs bot
```

### 2. Redis 连接失败

确保 Redis 容器正在运行：

```bash
docker compose ps
docker compose logs redis
```

### 3. RSS 无法获取

- 检查是否需要配置 HTTP 代理
- 检查 RSS 链接是否可访问
- 查看 Bot 日志中的错误信息

### 4. 关键词过滤不生效

- 确保关键词使用逗号分隔
- 关键词匹配不区分大小写
- 白名单和黑名单同时生效时，条目必须满足白名单条件且不满足黑名单条件

## 升级

```bash
# 拉取最新代码
git pull

# 重新构建镜像
docker compose build

# 停止旧容器
docker compose down

# 启动新容器
docker compose up -d
```

## 停止服务

```bash
docker compose down
```

如需清除数据：

```bash
docker compose down -v
```

## 项目结构

```
RSS-to-Telegram-Bot/
├── Dockerfile              # Docker 镜像构建文件
├── docker-compose.yml      # Docker Compose 配置文件
├── .env.example            # 环境变量示例
├── .env                    # 环境变量配置（需要创建）
├── start_bot.sh            # 启动脚本
├── prisma/                 # 数据库迁移文件
├── src/                    # 源代码
│   ├── util/
│   │   ├── config.ts       # 配置管理
│   │   └── axios.ts        # HTTP 客户端（支持代理）
│   ├── rss/                # RSS 服务
│   ├── telegram/           # Telegram 服务
│   └── ...
└── DEPLOYMENT.md           # 本文档
```
