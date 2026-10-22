import { z } from "zod";

/**
 * Validacao e normalizacao das variaveis de ambiente do servidor.
 *
 * Regra critica: nada aqui pode ser importado por um Client Component.
 * O arquivo e protegido por `import "server-only"` quando o pacote esta
 * disponivel; alem disso `NEXT_PUBLIC_*` nunca e lido neste modulo.
 */

const boolish = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  });

const intish = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().int().nonnegative());

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  DISABLE_RLS: boolish,
  AUTH_DRIVER: z.enum(["supabase", "local"]).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_FORCE_PASSWORD_CHANGE: boolish,
  STORAGE_DRIVER: z.enum(["s3", "local"]).optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolish,
  S3_PUBLIC_BASE_URL: z.string().optional(),
  MAX_UPLOAD_SIZE: intish(5 * 1024 * 1024 * 1024),
  MULTIPART_PART_SIZE: intish(16 * 1024 * 1024),
  MULTIPART_MAX_PARTS: intish(8),
  SIGNED_URL_TTL: intish(600),
  GOOGLE_DRIVE_ENABLED: boolish,
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_SCOPES: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_DEFAULT_CHAT_ID: z.string().optional(),
  AI_PROVIDER: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_MAX_TOKENS: intish(1500),
  SEARCH_PROVIDER: z.string().optional(),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  GOOGLE_CSE_API_KEY: z.string().optional(),
  GOOGLE_CSE_ID: z.string().optional(),
  TWITTER_BEARER_TOKEN: z.string().optional(),
  RATE_LIMIT_DRIVER: z.enum(["memory", "upstash"]).optional(),
  RATE_LIMIT_MAX: intish(120),
  RATE_LIMIT_WINDOW_SECONDS: intish(60),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  FETCH_USER_AGENT: z.string().optional(),
  IMPORT_MAX_MEDIA_SIZE: intish(100 * 1024 * 1024),
  LOCAL_STORAGE_SIGNING_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuracao de ambiente invalida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Testes precisam recarregar o cache apos alterar process.env. */
export function resetEnvCache(): void {
  cached = null;
}

export const isProduction = () => getEnv().NODE_ENV === "production";

export const isAuthSupabase = () => {
  const env = getEnv();
  if (env.AUTH_DRIVER) return env.AUTH_DRIVER === "supabase";
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
};

export const isStorageS3 = () => {
  const env = getEnv();
  if (env.STORAGE_DRIVER) return env.STORAGE_DRIVER === "s3";
  return Boolean(env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
};

/** Segredo usado para assinar cookies/tokens internos. */
export function getSessionSecret(): string {
  const env = getEnv();
  const secret = env.SESSION_SECRET ?? env.INTEGRATION_ENCRYPTION_KEY ?? env.LOCAL_STORAGE_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET ausente ou muito curto. Defina SESSION_SECRET (>=16 chars) no ambiente do servidor.",
    );
  }
  return secret;
}

export function getEncryptionKey(): Buffer {
  const env = getEnv();
  const raw = env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY ausente. Defina uma chave de 32 bytes (openssl rand -hex 32) para cifrar segredos de integracoes.",
    );
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY deve ter 32 bytes (hex de 64 caracteres ou base64 de 32 bytes).");
  }
  return key;
}

/** Segredo do driver de armazenamento local (assinatura de URLs). */
export function getLocalStorageSecret(): string {
  const env = getEnv();
  return env.LOCAL_STORAGE_SIGNING_SECRET ?? getSessionSecret();
}
