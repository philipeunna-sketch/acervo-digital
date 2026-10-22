import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { driveImportSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { getDriveAccessToken } from "@/lib/integrations/google-drive/tokens";
import { downloadDriveFile, getDriveFile } from "@/lib/integrations/google-drive/client";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { buildImportStorageKey } from "@/lib/storage/keys";
import { insertFile, setFileAlbums } from "@/lib/db/repo/files";
import { categoryOf, extensionOf, mimeFor } from "@/lib/validation/file-types";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

/**
 * Importa arquivos do Google Drive para o acervo.
 *
 * O conteudo e baixado pela API oficial (respeitando as permissoes concedidas
 * pelo usuario) e gravado no provedor de armazenamento escolhido.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, driveImportSchema);

    const result = await withUser(user.id, async (db) => {
      const accessToken = await getDriveAccessToken(db, user.id);
      const provider = await resolveStorageProvider(db, user.id, input.providerId ?? null);

      const imported: Array<{ id: string; name: string }> = [];
      const errors: Array<{ fileId: string; message: string }> = [];

      for (const fileId of input.fileIds) {
        try {
          const meta = await getDriveFile(accessToken, fileId);
          if (!meta) {
            errors.push({ fileId, message: "Arquivo nao encontrado ou sem acesso." });
            continue;
          }
          if (meta.mimeType.startsWith("application/vnd.google-apps.")) {
            errors.push({
              fileId,
              message: "Documentos nativos do Google (Docs/Sheets) precisam ser exportados antes da importacao.",
            });
            continue;
          }
          if (meta.size && meta.size > MAX_IMPORT_BYTES) {
            errors.push({ fileId, message: "Arquivo maior que o limite de importacao (200 MB)." });
            continue;
          }

          const response = await downloadDriveFile(accessToken, fileId);
          const buffer = new Uint8Array(await response.arrayBuffer());

          const extension = extensionOf(meta.name);
          const mimeType = mimeFor(meta.name, response.headers.get("content-type") ?? meta.mimeType);
          const key = buildImportStorageKey(user.id, "google-drive", meta.name);

          await provider.putObject({
            key,
            body: buffer,
            contentType: mimeType,
            contentLength: buffer.byteLength,
            metadata: { source: "google-drive", driveId: fileId },
          });

          const file = await insertFile(db, {
            userId: user.id,
            name: meta.name,
            originalName: meta.name,
            extension: extension || null,
            mimeType,
            sizeBytes: buffer.byteLength,
            category: categoryOf(extension || meta.name) as never,
            providerId: provider.id ?? null,
            providerKind: provider.kind,
            storageKey: key,
            source: "drive",
            sourceUrl: meta.webViewLink,
            externalId: fileId,
            sourceMeta: {
              driveId: fileId,
              mimeType: meta.mimeType,
              modifiedTime: meta.modifiedTime,
              owners: meta.owners,
              shared: meta.shared,
            },
          });

          if (input.albumId) await setFileAlbums(db, user.id, file.id, [input.albumId]);
          imported.push({ id: file.id, name: file.name });
        } catch (error) {
          errors.push({
            fileId,
            message: error instanceof Error ? error.message : "Falha ao importar o arquivo.",
          });
        }
      }

      await logAudit(db, {
        userId: user.id,
        action: "integration.google_drive.import",
        entityType: "integration",
        entityId: "google_drive",
        metadata: { imported: imported.length, errors: errors.length },
      });

      return { imported, errors };
    });

    return json({ ok: true, ...result });
  } catch (error) {
    return handleError(error);
  }
}
