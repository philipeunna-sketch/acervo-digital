import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { getUploadSession, updateUploadSession } from "@/lib/db/repo/uploads";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Cancela um upload: aborta o multipart, remove o objeto parcial e encerra a sessao. */
export async function DELETE(_request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const result = await withUser(user.id, async (db): Promise<
      | { kind: "canceled" }
      | { kind: "error"; error: string; status: number }
    > => {
      const session = await getUploadSession(db, user.id, id);
      if (!session) return { kind: "error", error: "Sessao de upload nao encontrada.", status: 404 };
      if (session.status === "completed") {
        return { kind: "error", error: "Upload ja concluido.", status: 409 };
      }

      const provider = await resolveStorageProvider(db, user.id, session.provider_id);
      try {
        if (session.multipart_upload_id) {
          await provider.abortMultipartUpload({
            key: session.storage_key,
            uploadId: session.multipart_upload_id,
          });
        } else {
          await provider.deleteObject(session.storage_key);
        }
      } catch (error) {
        console.error(
          "[uploads] falha ao limpar objeto parcial:",
          error instanceof Error ? error.message : error,
        );
      }

      await updateUploadSession(db, user.id, id, {
        status: "canceled",
        errorMessage: "Upload cancelado pelo usuario.",
      });
      await logAudit(db, {
        userId: user.id,
        action: "upload.canceled",
        entityType: "upload_session",
        entityId: id,
        metadata: { name: session.file_name },
      });
      return { kind: "canceled" };
    });

    if (result.kind === "error") return jsonError(result.error, result.status);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
