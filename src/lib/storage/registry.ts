import { getEnv, isStorageS3 } from "@/lib/env";
import { decryptSecret } from "@/lib/security/crypto";
import { LocalStorageProvider } from "@/lib/storage/local";
import { S3StorageProvider } from "@/lib/storage/s3";
import type { StorageProvider } from "@/lib/storage/types";
import type { Db } from "@/lib/db/client";

/**
 * Resolucao de provedores de armazenamento.
 *
 * A fonte de verdade e a tabela `storage_providers`. As credenciais ficam
 * cifradas no banco e so sao decifradas no servidor, no momento de uso.
 */

export interface ProviderRow {
  id: string;
  user_id: string | null;
  is_system: boolean;
  name: string;
  kind: "s3" | "local";
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  access_key_id: string | null;
  secret_access_key: string | null;
  is_default: boolean;
  is_active: boolean;
  last_tested_at: string | null;
  last_error: string | null;
  config: Record<string, unknown>;
}

const cache = new Map<string, { provider: StorageProvider; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export function invalidateStorageCache(providerId?: string): void {
  if (!providerId) {
    cache.clear();
    return;
  }
  cache.delete(providerId);
}

function buildProvider(row: ProviderRow): StorageProvider {
  if (row.kind === "local") {
    return new LocalStorageProvider({ name: row.name, bucket: row.bucket ?? "acervo-local", id: row.id });
  }
  const secret = decryptSecret(row.secret_access_key);
  if (!row.access_key_id || !secret) {
    throw new Error(`Provedor "${row.name}" sem credenciais validas. Reconfigure a integracao.`);
  }
  return new S3StorageProvider({
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    region: row.region ?? "us-east-1",
    bucket: row.bucket ?? "",
    accessKeyId: row.access_key_id,
    secretAccessKey: secret,
    forcePathStyle: Boolean(row.config?.forcePathStyle ?? true),
  });
}

export async function listProviders(db: Db, userId: string): Promise<ProviderRow[]> {
  return db.query<ProviderRow>(
    `select id, user_id, is_system, name, kind, endpoint, region, bucket, access_key_id,
            secret_access_key, is_default, is_active, last_tested_at, last_error, config
       from public.storage_providers
      where is_active = true
        and (user_id = $1 or is_system = true)
      order by is_default desc, created_at asc`,
    [userId],
  );
}

export async function getProviderRow(db: Db, userId: string, providerId: string): Promise<ProviderRow | null> {
  const rows = await db.query<ProviderRow>(
    `select id, user_id, is_system, name, kind, endpoint, region, bucket, access_key_id,
            secret_access_key, is_default, is_active, last_tested_at, last_error, config
       from public.storage_providers
      where id = $1 and is_active = true and (user_id = $2 or is_system = true)
      limit 1`,
    [providerId, userId],
  );
  return rows[0] ?? null;
}

export async function getDefaultProviderRow(db: Db, userId: string): Promise<ProviderRow | null> {
  const rows = await db.query<ProviderRow>(
    `select id, user_id, is_system, name, kind, endpoint, region, bucket, access_key_id,
            secret_access_key, is_default, is_active, last_tested_at, last_error, config
       from public.storage_providers
      where is_active = true and (user_id = $1 or is_system = true)
      order by is_default desc, is_system desc, created_at asc
      limit 1`,
    [userId],
  );
  return rows[0] ?? null;
}

/**
 * Provedor-storage a partir do ambiente (usado no bootstrap e como fallback
 * quando ainda nao existe registro no banco).
 */
export function envStorageProvider(): StorageProvider | null {
  const env = getEnv();
  if (!isStorageS3()) return null;
  return new S3StorageProvider({
    name: "Wasabi / S3",
    endpoint: env.S3_ENDPOINT ?? "",
    region: env.S3_REGION ?? "us-east-1",
    bucket: env.S3_BUCKET ?? "",
    accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true,
  });
}

export async function resolveStorageProvider(
  db: Db,
  userId: string,
  providerId?: string | null,
): Promise<StorageProvider> {
  if (providerId) {
    const cached = cache.get(providerId);
    if (cached && cached.expiresAt > Date.now()) return cached.provider;
    const row = await getProviderRow(db, userId, providerId);
    if (!row) throw new Error("Provedor de armazenamento nao encontrado ou inativo.");
    const provider = buildProvider(row);
    cache.set(providerId, { provider, expiresAt: Date.now() + CACHE_TTL_MS });
    return provider;
  }

  const row = await getDefaultProviderRow(db, userId);
  if (row) {
    const cached = cache.get(row.id);
    if (cached && cached.expiresAt > Date.now()) return cached.provider;
    const provider = buildProvider(row);
    cache.set(row.id, { provider, expiresAt: Date.now() + CACHE_TTL_MS });
    return provider;
  }

  const fromEnv = envStorageProvider();
  if (fromEnv) return fromEnv;
  return new LocalStorageProvider({ name: "Armazenamento local (dev)" });
}
