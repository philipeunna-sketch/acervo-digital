import { getEnv, isStorageS3 } from "@/lib/env";
import { getAuthAdapter } from "@/lib/auth/session";
import { readyDb } from "@/lib/db/client";
import { encryptSecret } from "@/lib/security/crypto";

/**
 * Procedimento de bootstrap (executado no servidor):
 *
 *  1. cria a conta administrativa inicial a partir de
 *     BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD (uma unica vez);
 *  2. registra o provedor de armazenamento definido no ambiente como
 *     provedor de sistema, para que a aplicacao funcione logo apos o deploy.
 *
 * Nenhuma dessas variaveis e exposta ao navegador.
 */

export interface BootstrapResult {
  adminCreated: boolean;
  adminEmail: string | null;
  storageProviderCreated: boolean;
  messages: string[];
}

export async function ensureBootstrap(): Promise<BootstrapResult> {
  const messages: string[] = [];
  const env = getEnv();
  const db = await readyDb();

  let adminCreated = false;
  const adminEmail = env.BOOTSTRAP_ADMIN_EMAIL?.trim() || null;

  if (adminEmail && env.BOOTSTRAP_ADMIN_PASSWORD) {
    const admins = await db.query<{ count: number }>(
      `select count(*)::int as count from public.profiles where role = 'admin'`,
    );
    const localAdmins = await db.query<{ count: number }>(
      `select count(*)::int as count from public.local_users where role = 'admin'`,
    );

    if ((admins[0]?.count ?? 0) === 0 && (localAdmins[0]?.count ?? 0) === 0) {
      const result = await getAuthAdapter().createAdminUser(
        adminEmail,
        env.BOOTSTRAP_ADMIN_PASSWORD,
      );
      if (result.ok) {
        adminCreated = true;
        messages.push(`Conta administrativa "${adminEmail}" criada. Troca de senha obrigatoria no primeiro acesso.`);
      } else {
        messages.push(`Falha ao criar a conta administrativa: ${result.error}`);
      }
    } else {
      messages.push("Conta administrativa ja existe - bootstrap ignorado.");
    }
  } else {
    messages.push(
      "BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD nao definidos: nenhuma conta administrativa foi criada.",
    );
  }

  let storageProviderCreated = false;
  if (isStorageS3()) {
    const existing = await db.query<{ id: string }>(
      `select id from public.storage_providers where kind = 's3' and bucket = $1 and is_system = true limit 1`,
      [env.S3_BUCKET ?? ""],
    );
    if (existing.length === 0) {
      await db.query(
        `insert into public.storage_providers (
            user_id, is_system, name, kind, endpoint, region, bucket, access_key_id,
            secret_access_key, is_default, is_active, config
         ) values (null, true, $1, 's3', $2, $3, $4, $5, $6, true, true, $7::jsonb)`,
        [
          "Wasabi / S3 (padrao)",
          env.S3_ENDPOINT ?? null,
          env.S3_REGION ?? "us-east-1",
          env.S3_BUCKET ?? "",
          env.S3_ACCESS_KEY_ID ?? "",
          encryptSecret(env.S3_SECRET_ACCESS_KEY ?? ""),
          JSON.stringify({ forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true }),
        ],
      );
      storageProviderCreated = true;
      messages.push("Provedor S3 do ambiente registrado como provedor padrao.");
    }
  }

  return { adminCreated, adminEmail, storageProviderCreated, messages };
}
