/**
 * 简单 IP 限流：内存 Map，按 Worker isolate 计数。
 * MVP 级别——不保证全局精确（多 isolate 各自计数），但足以拦截单 IP 高频刷上传。
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
    // 顺手清理过期桶，防止 Map 无限增长
    if (buckets.size > 10_000) {
      for (const [key, b] of buckets) {
        if (now > b.resetAt) buckets.delete(key);
      }
    }
  }
  bucket.count++;
  return bucket.count <= MAX_REQUESTS;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
