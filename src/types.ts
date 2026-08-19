export type ResourceType = "TEXT" | "MARKDOWN" | "IMAGE" | "FILE";

export interface ResourceRecord {
  type: ResourceType;
  /** TEXT/MARKDOWN: 原文; IMAGE/FILE: base64 */
  content: string;
  filename: string;
  size: number;
  createdAt: number;
  expireAt: number;
}

export interface UploadResponse {
  code: string;
  url: string;
  expireAt: number;
}

export const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** 允许的过期时长（秒）: 1h / 24h / 72h，默认 24h */
export const TTL_OPTIONS = [3600, 86400, 259200];
export const DEFAULT_TTL = 86400;

/** IMAGE 类型允许的 MIME 白名单 */
export const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/** FILE 类型允许的扩展名白名单 */
export const FILE_EXT = new Set([
  "pdf",
  "zip",
  "txt",
  "json",
  "csv",
  "md",
  "mp3",
  "mp4",
  "ogg",
  "wav",
]);

/** 明确禁止的扩展名（HTML/脚本/SVG 等可注入或可执行类型） */
export const BLOCKED_EXT = new Set([
  "html",
  "htm",
  "js",
  "mjs",
  "svg",
  "exe",
  "dll",
  "bat",
  "cmd",
  "sh",
  "php",
  "jar",
]);
