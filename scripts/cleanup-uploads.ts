/**
 * Job de manutencao: cancela sessoes de upload abandonadas e remove objetos
 * orfaos de multipart no storage local.
 *
 * Executar manualmente ou via cron da Vercel:
 *   curl -X POST https://<app>/api/jobs/cleanup
 */
import { closeDb, readyDb } from "@/lib/db/client";
import { listUploadSessions, updateUploadSession } from "@/lib/db/repo/uploads";
import { resolveStorageProvider } from "@/lib/storage/registry";

const STALE_MINUTES = 60;

async function main(): Promise<void> {
  const db = await readyDb();
  const sessions = await listUploadSessions(db, "system", { limit: 200 });

  let canceled = 0;
  for (const session of sessions) {
    if (!["uploading", "preparing", "paused"].includes(session.status)) continue;
    const updatedAt = new Date(session.updated_at).getTime();
    if (Date.now() - updatedAt < STALE_MINUTES * 60_000) continue;

    try {
      const provider = await resolveStorageProvider(db, session.user_id, session.provider_id);
      if (session.multipart_upload_id) {
        await provider.abortMultipartUpload({
          key: session.storage_key,
          uploadId: session.multipart_upload_id,
        });
      } else {
        await provider.deleteObject(session.storage_key);
      }
    } catch {
      // O cleanup do storage e best-effort.
    }

    await updateUploadSession(db, session.user_id, session.id, {
      status: "canceled",
      errorMessage: "Sessao expirada por inatividade.",
    });
    canceled += 1;
  }

  console.log(`[cleanup] ${canceled} sessao(oes) de upload cancelada(s).`);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
