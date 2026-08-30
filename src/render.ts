import { toString as qrToString } from "qrcode";
import { marked, Renderer, type Tokens } from "marked";
import type { ResourceRecord } from "./types";
import { base64ToBytes, fileExt, mimeFromName } from "./util";

/** 生成分享链接的二维码 SVG（qrcode 纯字符串渲染，兼容 Workers） */
export function qrSvg(url: string): Promise<string> {
  return qrToString(url, { type: "svg", margin: 1, width: 140 });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 链接/图片仅允许 http(s)、相对路径、锚点、mailto */
function safeUrl(url: string | null): url is string {
  if (!url) return false;
  return /^(https?:\/\/|\/|#|mailto:)/i.test(url);
}

const renderer = new Renderer();
// 禁用原始 HTML：源码中的标签按纯文本转义输出，防 XSS
renderer.html = ({ text }) => escapeHtml(text);
renderer.link = function ({ href, title, tokens }: Tokens.Link) {
  const text = this.parser.parseInline(tokens);
  if (!safeUrl(href)) return text;
  const t = title ? ` title="${escapeHtml(title)}"` : "";
  return `<a href="${escapeHtml(href)}" rel="nofollow noopener"${t}>${text}</a>`;
};
renderer.image = ({ href, title, text }: Tokens.Image) => {
  if (!safeUrl(href)) return escapeHtml(text);
  const t = title ? ` title="${escapeHtml(title)}"` : "";
  return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${t}>`;
};
marked.use({ renderer });

/** 服务端渲染 Markdown（同步，输出已按白名单消毒） */
export function renderMarkdown(src: string): string {
  return marked.parse(src, { async: false }) as string;
}

/** V2EX 风格极简样式 */
const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 15px; color: #333; background: #e2e2e2; line-height: 1.6;
}
.container { max-width: 680px; margin: 40px auto; padding: 0 12px; }
.box { background: #fff; border-radius: 3px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
h1 { font-size: 20px; margin-bottom: 4px; }
h1 a { color: #333; text-decoration: none; }
.subtitle { color: #999; font-size: 13px; margin-bottom: 16px; }
label { display: block; font-size: 13px; color: #666; margin: 12px 0 4px; }
textarea {
  width: 100%; min-height: 180px; padding: 10px; border: 1px solid #ddd;
  border-radius: 3px; font: inherit; resize: vertical;
}
textarea:focus, select:focus { outline: none; border-color: #666; }
select, input[type=file] { font: inherit; }
select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 3px; background: #fff; }
.burn-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #666; margin: 12px 0 0; cursor: pointer; }
.burn-row input { margin: 0; }
.notice { color: #b35900; font-size: 13px; margin: 8px 0 0; }
.qr { margin: 16px 0 0; text-align: center; }
.qr svg { background: #fff; padding: 6px; border: 1px solid #eee; border-radius: 3px; }
.file-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-name { color: #666; font-size: 13px; word-break: break-all; }
button {
  background: #778087; color: #fff; border: none; border-radius: 3px;
  padding: 8px 20px; font-size: 15px; cursor: pointer; margin-top: 16px;
}
button:hover { background: #666f76; }
button:disabled { background: #aaa; cursor: not-allowed; }
.result { margin-top: 16px; padding: 12px; background: #f6f6f6; border-radius: 3px; display: none; }
.result a { color: #369; word-break: break-all; }
.error { color: #c0392b; font-size: 13px; margin-top: 12px; display: none; }
.meta { color: #999; font-size: 13px; margin-top: 16px; }
.meta span { margin-right: 16px; }
.countdown { color: #778087; }
pre.content {
  background: #f6f6f6; padding: 14px; border-radius: 3px; overflow-x: auto;
  white-space: pre-wrap; word-break: break-word; font-size: 14px; margin-top: 8px;
}
img.image { max-width: 100%; border-radius: 3px; margin-top: 8px; }
.md { margin-top: 8px; overflow-wrap: break-word; }
.md h1, .md h2, .md h3 { margin: 14px 0 6px; }
.md h1 { font-size: 18px; } .md h2 { font-size: 16px; } .md h3 { font-size: 15px; }
.md code { background: #f0f0f0; padding: 1px 4px; border-radius: 2px; font-size: 13px; }
.md pre { background: #f6f6f6; padding: 12px; border-radius: 3px; overflow-x: auto; margin: 8px 0; }
.md pre code { background: none; padding: 0; }
.md p { margin: 6px 0; }
.md a { color: #369; }
.md ul, .md ol { padding-left: 22px; margin: 6px 0; }
.md blockquote { border-left: 3px solid #ddd; padding-left: 10px; color: #777; margin: 8px 0; }
.md img { max-width: 100%; border-radius: 3px; margin: 8px 0; }
.md table { border-collapse: collapse; margin: 10px 0; font-size: 14px; }
.md th, .md td { border: 1px solid #ddd; padding: 6px 12px; text-align: left; }
.md th { background: #f6f6f6; }
.expired { text-align: center; color: #999; padding: 40px 0; }
.footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 20px; }
`;

function page(title: string, body: string, script = ""): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - AnyShare</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
${body}
<div class="footer">AnyShare · 匿名临时分享空间 · 过期自动销毁</div>
</div>
<script>${script}</script>
</body>
</html>`;
}

/** 首页：文本输入 + 文件上传 */
export function renderHome(): string {
  const body = `
<div class="box">
  <h1><a href="/">AnyShare</a></h1>
  <div class="subtitle">无需注册的临时分享空间，资源到期自动销毁</div>
  <label for="text">文本内容</label>
  <textarea id="text" placeholder="输入要分享的文本或 Markdown，或直接选择文件"></textarea>
  <label for="type">文本类型</label>
  <select id="type">
    <option value="TEXT">纯文本</option>
    <option value="MARKDOWN">Markdown</option>
  </select>
  <label>文件（可选，选择后将忽略文本内容，最大 10MB）</label>
  <div class="file-row">
    <input type="file" id="file">
    <span class="file-name" id="fileName"></span>
  </div>
  <label for="ttl">有效期</label>
  <select id="ttl">
    <option value="3600">1 小时</option>
    <option value="86400" selected>24 小时</option>
    <option value="259200">72 小时</option>
  </select>
  <label class="burn-row" for="burn">
    <input type="checkbox" id="burn"> 阅后即焚（首次访问后销毁，链接失效）
  </label>
  <button id="create">创建分享链接</button>
  <div class="error" id="error"></div>
  <div class="result" id="result">
    分享链接：<a id="link" href=""></a>
    <button id="copy" type="button" style="margin-top:8px;padding:4px 12px;font-size:13px">复制链接</button>
    <div class="qr" id="qr"></div>
  </div>
</div>`;

  const script = `
const $ = (id) => document.getElementById(id);
$("file").addEventListener("change", () => {
  $("fileName").textContent = $("file").files[0] ? $("file").files[0].name : "";
});
// 粘贴板贴图：Ctrl+V 直接把剪贴板图片当作待上传文件
document.addEventListener("paste", (e) => {
  const items = e.clipboardData ? e.clipboardData.items : [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      $("file").files = dt.files;
      $("fileName").textContent = file.name || "剪贴板图片";
      e.preventDefault();
      return;
    }
  }
});
function showError(msg) {
  const e = $("error");
  e.textContent = msg;
  e.style.display = "block";
}
function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.slice(r.result.indexOf(",") + 1));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
$("create").addEventListener("click", async () => {
  $("error").style.display = "none";
  $("result").style.display = "none";
  const btn = $("create");
  btn.disabled = true;
  btn.textContent = "创建中...";
  try {
    let payload;
    const file = $("file").files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10MB 限制");
      payload = {
        type: file.type.startsWith("image/") ? "IMAGE" : "FILE",
        content: await toBase64(file),
        filename: file.name,
      };
    } else {
      const text = $("text").value;
      if (!text.trim()) throw new Error("请输入文本内容或选择文件");
      payload = { type: $("type").value, content: text };
    }
    payload.ttl = parseInt($("ttl").value, 10);
    payload.burn = $("burn").checked;
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "创建失败");
    const url = location.origin + "/share/" + data.code;
    $("link").textContent = url;
    $("link").href = url;
    $("qr").innerHTML = data.qr || "";
    $("result").style.display = "block";
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "创建分享链接";
  }
});
$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("link").href);
  $("copy").textContent = "已复制";
  setTimeout(() => ($("copy").textContent = "复制链接"), 1500);
});`;

  return page("分享", body, script);
}

/** FILE 记录的 base64 内容 -> 文本（仅用于文本类文件预览） */
function decodeFileText(record: ResourceRecord): string {
  return new TextDecoder().decode(base64ToBytes(record.content));
}

/** 资源页：按类型展示内容 + 下载按钮 + 二维码 + 创建/剩余时间 */
export async function renderShare(
  code: string,
  record: ResourceRecord,
  pageUrl: string
): Promise<string> {
  const burn = record.burn === true;
  // MARKDOWN server-rendered; only TEXT ships content to the client
  const dataObj: Record<string, unknown> = {
    code,
    type: record.type,
    filename: record.filename,
    size: record.size,
    createdAt: record.createdAt,
    expireAt: record.expireAt,
    burn,
  };
  if (record.type === "TEXT") dataObj.content = record.content;
  const data = JSON.stringify(dataObj)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  // 阅后即焚提示：TEXT/MARKDOWN/IMAGE 内容内嵌页面、渲染即销毁；FILE 首次下载后销毁
  const pageBurn = burn && record.type !== "FILE";
  const burnNotice = pageBurn
    ? `<div class="notice">🔥 阅后即焚：本次浏览后即销毁，刷新或再次访问将不可见</div>`
    : burn
      ? `<div class="notice">🔥 阅后即焚：首次下载后自动销毁</div>`
      : "";

  let body: string;
  if (record.type === "TEXT") {
    body = `<div class="box"><h1>文本分享</h1>${burnNotice}<pre class="content" id="content"></pre>`;
  } else if (record.type === "MARKDOWN") {
    body = `<div class="box"><h1>Markdown 分享</h1>${burnNotice}<div class="md">${renderMarkdown(
      record.content
    )}</div>`;
  } else if (record.type === "IMAGE") {
    // 阅后即焚时内嵌 data URI，页面渲染即视为已读
    const src = burn
      ? `data:${mimeFromName(record.filename)};base64,${record.content}`
      : `/share/${code}/download`;
    body = `<div class="box"><h1>图片分享</h1>${burnNotice}<img class="image" src="${src}" alt="shared image">`;
  } else {
    // FILE：文本类文件（txt/json/csv/md）在线预览，其余显示文件名
    const ext = fileExt(record.filename);
    if (ext === "md") {
      body = `<div class="box"><h1>文件分享</h1>${burnNotice}<div class="md">${renderMarkdown(
        decodeFileText(record)
      )}</div>`;
    } else if (ext === "txt" || ext === "csv" || ext === "json") {
      let text = decodeFileText(record);
      if (ext === "json") {
        try {
          text = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          // 非法 JSON 按原文展示
        }
      }
      body = `<div class="box"><h1>文件分享</h1>${burnNotice}<pre class="content">${escapeHtml(
        text
      )}</pre>`;
    } else {
      body = `<div class="box"><h1>文件分享</h1>${burnNotice}<pre class="content">📄 ${escapeHtml(
        record.filename || code
      )}</pre>`;
    }
  }

  // 阅后即焚的 TEXT/MARKDOWN/IMAGE 内容已在页面上，无需再提供下载入口
  const showDownload = !pageBurn;
  body += `
  <div class="meta">
    <span id="created"></span>
    <span id="filename"></span>
    <span id="size"></span>
  </div>
  <div class="meta"><span class="countdown" id="countdown"></span></div>
  <div class="qr">${await qrSvg(pageUrl)}</div>
  ${showDownload ? `<a href="/share/${code}/download" download><button>下载</button></a>` : ""}
</div>`;

  const script = `
const DATA = ${data};
const $ = (id) => document.getElementById(id);
$("created").textContent = "创建于 " + new Date(DATA.createdAt).toLocaleString();
$("size").textContent = DATA.size > 0 ? "大小 " + formatSize(DATA.size) : "";
$("filename").textContent = DATA.filename || "";
function formatSize(n) {
  if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
  if (n > 1024) return (n / 1024).toFixed(1) + " KB";
  return n + " B";
}
function countdown() {
  const left = DATA.expireAt - Date.now();
  if (left <= 0) {
    $("countdown").textContent = "已过期";
    return;
  }
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  $("countdown").textContent = "剩余 " + (h > 0 ? h + " 小时 " : "") + m + " 分 " + s + " 秒";
  setTimeout(countdown, 1000);
}
// 阅后即焚且已随页面销毁的资源，倒计时无意义
if (DATA.burn && DATA.type !== "FILE") {
  $("countdown").textContent = "已销毁";
} else {
  countdown();
}
if (DATA.type === "TEXT") {
  $("content").textContent = DATA.content;
}`;

  return page(`分享 ${code}`, body, script);
}

/** 资源不存在 / 已过期页面 */
export function renderExpired(): string {
  return page(
    "已过期",
    `<div class="box"><div class="expired">资源不存在或已过期<br><br><a href="/">返回首页创建新分享</a></div></div>`
  );
}
