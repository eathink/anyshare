const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LEN = 6;

/** 生成 6 位 Base62 随机短码 */
export function generateCode(): string {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) {
    code += ALPHABET[bytes[i] % 62];
  }
  return code;
}

/**
 * 生成不冲突的短码：生成后查 KV 确认未被占用，最多重试 5 次。
 * 6 位 Base62 共 62^6 ≈ 568 亿组合，冲突概率极低。
 */
export async function generateUniqueCode(
  exists: (code: string) => Promise<unknown>
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    if ((await exists(code)) === null) return code;
  }
  throw new Error("CODE_CONFLICT");
}
