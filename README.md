# AnyShare

匿名、无账号、自动过期的互联网临时空间。基于 Cloudflare Worker + Workers KV，无需数据库。

## 功能

- 上传 **文本 / Markdown / 图片 / 文件**，生成 6 位 Base62 短码
- 访问地址 `/share/{code}`：文本直接展示、图片直接显示、文件提供下载
- 自动过期（默认 24 小时，可选 1h / 24h / 72h），由 KV `expirationTtl` 自动删除
- 单资源最大 10MB，文件类型白名单，拒绝 HTML/脚本/SVG 等可注入类型
- 简单 IP 限流（每分钟 10 次上传）

## 技术栈

- Cloudflare Worker（TypeScript）
- Workers KV（binding: `STORAGE`）——唯一存储，短码为 key
- 内联 HTML/CSS/JS 前端，V2EX 风格，无 UI 框架

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 本地开发（wrangler 会自动创建本地模拟 KV，无需真实 namespace）
npm run dev
```

打开 http://localhost:8787 即可。

> wrangler dev 默认将 KV 数据持久化到 `.wrangler/state`，重启不丢失。

## 部署

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建 KV namespace，复制输出中的 id
npx wrangler kv namespace create STORAGE

# 3. 将 id 填入 wrangler.toml 中 kv_namespaces.id

# 4. 部署
npm run deploy
```

部署完成后可查看实时日志：

```bash
npm run tail
```

## API

### 创建资源

```bash
curl -X POST http://localhost:8787/api/upload \
  -H "Content-Type: application/json" \
  -d '{"type":"TEXT","content":"hello world","ttl":3600}'
```

- `type`: `TEXT` / `MARKDOWN` / `IMAGE` / `FILE`
- `content`: 文本为原文；图片/文件为 base64（不带 data: 前缀）
- `filename`: 图片/文件必填
- `ttl`: 3600 / 86400 / 259200，缺省 24 小时

返回：

```json
{ "code": "aB3xY9", "url": "/share/aB3xY9", "expireAt": 1755625200000 }
```

### 获取资源

```bash
curl http://localhost:8787/api/resource/aB3xY9
```

### 网页访问

- `GET /share/{code}` — 资源页面
- `GET /share/{code}/download` — 原始字节流下载

## KV 数据结构

key: 短码，value:

```json
{
  "type": "TEXT",
  "content": "hello world",
  "filename": "",
  "size": 11,
  "createdAt": 1755538800000,
  "expireAt": 1755625200000
}
```

## 已知限制（MVP 取舍）

- IP 限流基于单个 Worker isolate 的内存计数，多实例下不精确，仅作基本防护
- KV TTL 有约 60 秒容差，读取时会兜底判定过期
- 无权限系统、无删除接口、无管理员功能
