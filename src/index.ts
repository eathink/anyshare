import { generateUniqueCode } from "./code";
import { clientIp, rateLimit } from "./limit";
import { qrSvg, renderExpired, renderHome, renderShare } from "./render";
import {
  BLOCKED_EXT,
  DEFAULT_TTL,
  FILE_EXT,
  IMAGE_MIME,
  MAX_SIZE,
  TTL_OPTIONS,
  type ResourceRecord,
  type ResourceType,
} from "./types";
import { base64ToBytes, fileExt, mimeFromName } from "./util";

interface Env {
  STORAGE: KVNamespace;
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** 校验上传负载，返回错误信息或 null */
function validate(payload: {
  type: string;
  content: string;
  filename?: string;
}): string | null {
  const { type, content, filename } = payload;
  if (!["TEXT", "MARKDOWN", "IMAGE", "FILE"].includes(type)) {
    return "不支持的资源类型";
  }
  if (typeof content !== "string" || content.length === 0) return "内容不能为空";

  if (type === "TEXT" || type === "MARKDOWN") {
    // 文本按 UTF-16 粗略估算字节，上限 10MB 足够保守
    if (content.length * 2 > MAX_SIZE) return "文本超过 10MB 限制";
    return null;
  }

  // IMAGE / FILE：content 为 base64
  if (!filename) return "缺少文件名";
  const ext = fileExt(filename);
  if (BLOCKED_EXT.has(ext)) return `不允许上传 .${ext} 类型文件`;
  if (type === "IMAGE") {
    if (!IMAGE_MIME.has(mimeFromName(filename))) {
      return "图片仅支持 png / jpeg / gif / webp";
    }
  } else if (!FILE_EXT.has(ext)) {
    return "不支持的文件类型（允许：pdf zip txt json csv md mp3 mp4 ogg wav）";
  }
  const bytes = Math.floor((content.length * 3) / 4);
  if (bytes > MAX_SIZE) return "文件超过 10MB 限制";
  return null;
}

async function getRecord(
  env: Env,
  code: string
): Promise<ResourceRecord | null> {
  const record = await env.STORAGE.get<ResourceRecord>(code, "json");
  if (!record) return null;
  // KV TTL 有约 60 秒的延迟容差，读取时兜底判定
  if (record.expireAt <= Date.now()) return null;
  return record;
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // ---------- 首页 ----------
    if (request.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      return new Response(renderHome(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ---------- 创建资源 ----------
    if (request.method === "POST" && pathname === "/api/upload") {
      if (!rateLimit(clientIp(request))) {
        return json({ error: "请求过于频繁，请稍后再试" }, 429);
      }

      // 先看 Content-Length 提前拒绝：文件经 base64 膨胀 4/3，再加 JSON 外壳开销
      const contentLength = Number(request.headers.get("Content-Length"));
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_SIZE * 1.4 + 2048
      ) {
        return json({ error: "请求体超过大小限制" }, 413);
      }

      let payload: {
        type: ResourceType;
        content: string;
        filename?: string;
        ttl?: number;
        burn?: boolean;
      };
      try {
        payload = await request.json();
      } catch {
        return json({ error: "请求体必须是 JSON" }, 400);
      }

      const error = validate(payload);
      if (error) return json({ error }, 400);

      const ttl = TTL_OPTIONS.includes(payload.ttl ?? 0)
        ? (payload.ttl as number)
        : DEFAULT_TTL;

      let size: number;
      if (payload.type === "TEXT" || payload.type === "MARKDOWN") {
        size = new TextEncoder().encode(payload.content).length;
      } else {
        try {
          size = base64ToBytes(payload.content).length;
        } catch {
          return json({ error: "文件内容不是有效的 base64" }, 400);
        }
      }

      let code: string;
      try {
        code = await generateUniqueCode((c) => env.STORAGE.get(c));
      } catch {
        // 短码连续冲突，概率极低，提示重试即可
        return json({ error: "创建失败，请重试" }, 500);
      }
      const record: ResourceRecord = {
        type: payload.type,
        content: payload.content,
        filename: payload.filename || "",
        size,
        createdAt: Date.now(),
        expireAt: Date.now() + ttl * 1000,
        burn: payload.burn === true,
      };

      // expirationTtl 最低 60 秒
      await env.STORAGE.put(code, JSON.stringify(record), {
        expirationTtl: Math.max(60, ttl),
      });

      const shareUrl = `${new URL(request.url).origin}/share/${code}`;
      return json({
        code,
        url: `/share/${code}`,
        qr: await qrSvg(shareUrl),
        expireAt: record.expireAt,
      });
    }

    // ---------- 获取资源（API） ----------
    const apiMatch = pathname.match(/^\/api\/resource\/([A-Za-z0-9]{6})$/);
    if (request.method === "GET" && apiMatch) {
      const record = await getRecord(env, apiMatch[1]);
      if (!record) return json({ error: "资源不存在或已过期" }, 404);
      // 阅后即焚：内容已被读取（在内存中），直接销毁
      if (record.burn) await env.STORAGE.delete(apiMatch[1]);
      return json(record);
    }

    // ---------- 资源下载（原始字节流） ----------
    const dlMatch = pathname.match(/^\/share\/([A-Za-z0-9]{6})\/download$/);
    if (request.method === "GET" && dlMatch) {
      const code = dlMatch[1];
      const record = await getRecord(env, code);
      if (!record) {
        return new Response(renderExpired(), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      const bytes =
        record.type === "TEXT" || record.type === "MARKDOWN"
          ? new TextEncoder().encode(record.content)
          : base64ToBytes(record.content);
      const headers: Record<string, string> = {
        "Content-Type":
          record.type === "TEXT"
            ? "text/plain; charset=utf-8"
            : mimeFromName(record.filename),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          record.filename || `${code}.txt`
        )}`,
        "Cache-Control": "no-store",
      };
      // 阅后即焚：字节已读入内存，返回前销毁
      if (record.burn) await env.STORAGE.delete(code);
      return new Response(bytes as unknown as BodyInit, { headers });
    }

    // ---------- 资源页面 ----------
    const shareMatch = pathname.match(/^\/share\/([A-Za-z0-9]{6})$/);
    if (request.method === "GET" && shareMatch) {
      const code = shareMatch[1];
      const record = await getRecord(env, code);
      if (!record) {
        return new Response(renderExpired(), {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      const pageUrl = `${new URL(request.url).origin}/share/${code}`;
      const html = await renderShare(code, record, pageUrl);
      // 阅后即焚：TEXT/MARKDOWN/IMAGE 内容已内嵌进页面，渲染即销毁；
      // FILE 类型在首次下载时销毁（见 /download 路由）
      if (record.burn && record.type !== "FILE") {
        await env.STORAGE.delete(code);
      }
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return json({ error: "Not Found" }, 404);
  },
};
