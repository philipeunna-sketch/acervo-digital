/**
 * Verifica a conectividade com o provedor de armazenamento configurado.
 *
 *   npm run storage:check
 */
import { closeDb, readyDb } from "@/lib/db/client";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { getEnv, isStorageS3 } from "@/lib/env";

async function main(): Promise<void> {
  const env = getEnv();
  console.log(`Driver: ${isStorageS3() ? "s3 (Wasabi/AWS)" : "local (desenvolvimento)"}`);

  const db = await readyDb();
  const provider = await resolveStorageProvider(db, "system-check", null);
  const health = await provider.healthCheck();

  console.log(`Provedor: ${provider.name} (${provider.kind})`);
  console.log(health.ok ? `OK: ${health.message}` : `FALHA: ${health.message}`);

  if (!health.ok) {
    console.log(
      `Verifique as variaveis: ${["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].join(", ")} (DATABASE_URL=${env.DATABASE_URL ? "definida" : "ausente"}).`,
    );
    process.exitCode = 1;
  }

  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
