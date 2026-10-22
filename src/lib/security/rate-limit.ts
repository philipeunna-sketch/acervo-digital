import { getEnv } from "@/lib/env";

/**
 * Rate limiting com dois drivers:
 *  - `memory`  : janela deslizante em memoria (padrao; ideal para dev/single instance)
 *  - `upstash` : contadores compartilhados via REST (multi-instance na Vercel)
 *
 * A limitacao e por chave (rota + IP + usuario). Em ambiente serverless o
 * driver em memoria e por instancia: use `RATE_LIMIT_DRIVER=upstash` em producao
 * com multiplas regioes.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const globalForRate = globalThis as unknown as { __acervoRate?: Map<string, Bucket> };

function memoryStore(): Map<string, Bucket> {
  if (!globalForRate.__acervoRate) globalForRate.__acervoRate = new Map();
  return globalForRate.__acervoRate;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfter: number;
}

export async function rateLimit(
  key: string,
  options?: { limit?: number; windowSeconds?: number },
): Promise<RateLimitResult> {
  const env = getEnv();
  const limit = options?.limit ?? env.RATE_LIMIT_MAX;
  const windowSeconds = options?.windowSeconds ?? env.RATE_LIMIT_WINDOW_SECONDS;

  if (env.RATE_LIMIT_DRIVER === "upstash" && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return upstashLimit(key, limit, windowSeconds);
  }
  return memoryLimit(key, limit, windowSeconds);
}

function memoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const store = memoryStore();
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, limit, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
  if (existing.count > limit) {
    return { allowed: false, remaining: 0, limit, retryAfter };
  }
  return { allowed: true, remaining: limit - existing.count, limit, retryAfter };
}

async function upstashLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const env = getEnv();
  const url = `${env.UPSTASH_REDIS_REST_URL!}/pipeline`;
  const redisKey = `acervo:rl:${key}`;
  const body = [
    ["INCR", redisKey],
    ["PEXPIRE", redisKey, String(windowSeconds * 1000)],
    ["TTL", redisKey],
  ];
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`upstash ${response.status}`);
    const payload = (await response.json()) as Array<{ result: number | null }>;
    const count = Number(payload[0]?.result ?? 1);
    const ttl = Number(payload[2]?.result ?? windowSeconds);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      limit,
      retryAfter: ttl > 0 ? ttl : windowSeconds,
    };
  } catch {
    // Falha do provedor de rate limit nao deve derrubar a requisicao.
    return { allowed: true, remaining: limit, limit, retryAfter: 0 };
  }
}

/** Identificador do cliente para fins de limitacao. */
export function clientIdentifier(request: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}
