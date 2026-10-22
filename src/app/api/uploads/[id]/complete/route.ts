import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { uploadCompleteSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { getUploadSession, updateUploadSession } from "@/lib/db/repo/uploads";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { insertFile, setFileAlbums } from "@/lib/db/repo/files";
import { setFileTags } from "@/lib/db/repo/tags";
import { categoryOf, extensionOf, mimeFor } from "@/lib/validation/file-types";
import { logAudit } from "@/lib/db/repo/audit";
import type { UploadPartMeta } from "@/types";
import type { FileRecord } from "@/types";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Conclui o upload: finaliza o multipart (quando aplicavel), **confere a
 * persistencia do objeto no storage** e so entao registra o arquivo no acervo.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const input = await parseJsonBody(request, uploadCompleteSchema);

    const payload = await withUser(user.id, async (db): Promise<
      | { kind: "file"; file: FileRecord }
      | { kind: "error"; error: string; status: number }
      | { kind: "done"; fileId: string }
    > => {
      const session = await getUploadSession(db, user.id, id);
      if (!session) return { kind: "error", error: "Sessao de upload nao encontrada.", status: 404 };
      if (session.status === "completed" && session.file_id) {
        return { kind: "done", fileId: session.file_id };
      }
      if (session.status === "canceled") {
        return { kind: "error", error: "Upload cancelado.", status: 409 };
      }

      const provider = await resolveStorageProvider(db, user.id, session.provider_id);

      const parts: UploadPartMeta[] = input.parts.map((part) => ({
        partNumber: part.partNumber,
        etag: part.etag.replaceAll('"', ""),
        size: part.size ?? 0,
      }));

      if (session.multipart_upload_id) {
        await provider.completeMultipartUpload({
          key: session.storage_key,
          uploadId: session.multipart_upload_id,
          parts,
        });
      }

      // Verificacao de persistencia: o objeto precisa existir no storage.
      const meta = await provider.headObject(session.storage_key);
      if (!meta) {
        await updateUploadSession(db, user.id, id, {
          status: "failed",
          errorMessage: "O objeto nao foi encontrado no storage apos o envio.",
        });
        return {
          kind: "error",
          error: "O storage nao confirmou a persistencia do arquivo.",
          status: 502,
        };
      }

      const expected = session.size_bytes;
      const tolerance = Math.max(1024, Math.round(expected * 0.001));
      if (expected > 0 && Math.abs(meta.size - expected) > tolerance) {
        await updateUploadSession(db, user.id, id, {
          status: "failed",
          errorMessage: `Tamanho divergente: esperado ${expected} bytes, recebido ${meta.size}.`,
        });
        return {
          kind: "error",
          error: `Tamanho divergente (esperado ${expected} bytes, storage gravou ${meta.size} bytes).`,
          status: 409,
        };
      }

      const mimeType = mimeFor(session.file_name, session.mime_type);
      const extension = extensionOf(session.file_name);
      const file = await insertFile(db, {
        userId: user.id,
        name: session.file_name,
        originalName: session.file_name,
        extension: extension || null,
        mimeType,
        sizeBytes: meta.size || expected,
        category: categoryOf(extension || session.file_name) as never,
        providerId: provider.id ?? null,
        providerKind: provider.kind,
        storageKey: session.storage_key,
        checksum: session.checksum ?? null,
        source: "upload",
      });

      await updateUploadSession(db, user.id, id, {
        status: "completed",
        fileId: file.id,
        uploadedBytes: meta.size || expected,
        parts,
        completedAt: new Date().toISOString(),
        errorMessage: null,
      });

      if (input.albumId) {
        await setFileAlbums(db, user.id, file.id, [input.albumId]);
      }
      if (input.tags?.length) {
        await setFileTags(db, user.id, file.id, input.tags);
      }

      await logAudit(db, {
        userId: user.id,
        action: "upload.completed",
        entityType: "file",
        entityId: file.id,
        metadata: { name: file.name, size: file.size_bytes },
      });

      return { kind: "file", file };
    });

    if (payload.kind === "error") return jsonError(payload.error, payload.status);
    if (payload.kind === "done") return json({ ok: true, fileId: payload.fileId, alreadyCompleted: true });
    return json({ ok: true, file: payload.file });
  } catch (error) {
    return handleError(error);
  }
}
