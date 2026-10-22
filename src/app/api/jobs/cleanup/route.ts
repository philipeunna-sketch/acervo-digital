import { NextResponse } from "next/server";
import { listUploadSessions, updateUploadSession } from "@/lib/db/repo/uploads";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { getCurrentUser } from "@/lib/auth/session";
import { readyDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_MINUTES = 60;

/**
 * Rotina de manutencao executada por cron (Vercel Cron).
 * Cancela sessoes de upload abandonadas e limpa objetos parciais.
 *
 * Protegida por `CRON_SECRET` (header `authorization: Bearer <secret>`).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (secret && authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const user = await getCurrentUser();
  if (!user && !secret) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const db = await readyDb();
  const sessions = await listUploadSessions(db, user?.id ?? "system", { limit: 200 });

  let canceled = 0;
  for (const session of sessions) {
    if (!["uploading", "preparing", "paused"].includes(session.status)) continue;
    if (Date.now() - new Date(session.updated_at).getTime() < STALE_MINUTES * 60_000) continue;

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
      // Best-effort.
    }

    await updateUploadSession(db, session.user_id, session.id, {
      status: "canceled",
      errorMessage: "Sessao expirada por inatividade.",
    });
    canceled += 1;
  }

  return NextResponse.json({ ok: true, canceled });
}
