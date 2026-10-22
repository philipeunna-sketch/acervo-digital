import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { bulkActionSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import {
  deletePermanently,
  getFiles,
  moveToTrash,
  restoreFromTrash,
  setFavorite,
  setFileAlbums,
} from "@/lib/db/repo/files";
import { setFileTags } from "@/lib/db/repo/tags";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, bulkActionSchema);

    const result = await withUser(user.id, async (db) => {
      switch (input.action) {
        case "trash": {
          const count = await moveToTrash(db, user.id, input.fileIds);
          await logAudit(db, {
            userId: user.id,
            action: "bulk.trash",
            entityType: "file",
            entityId: null,
            metadata: { count },
          });
          return { count };
        }
        case "restore": {
          const count = await restoreFromTrash(db, user.id, input.fileIds);
          return { count };
        }
        case "delete": {
          const deleted = await deletePermanently(db, user.id, input.fileIds);
          let removed = 0;
          for (const file of deleted) {
            try {
              const provider = await resolveStorageProvider(db, user.id, file.provider_id);
              await provider.deleteObject(file.storage_key);
              removed += 1;
            } catch {
              // O registro foi removido do banco; a limpeza do bucket pode ser
              // refeita pelo job de manutencao.
            }
          }
          await logAudit(db, {
            userId: user.id,
            action: "bulk.delete_permanent",
            entityType: "file",
            entityId: null,
            metadata: { count: deleted.length },
          });
          return { count: deleted.length, objectsRemoved: removed };
        }
        case "favorite": {
          let count = 0;
          for (const fileId of input.fileIds) {
            await setFavorite(db, user.id, fileId, true);
            count += 1;
          }
          return { count };
        }
        case "unfavorite": {
          let count = 0;
          for (const fileId of input.fileIds) {
            await setFavorite(db, user.id, fileId, false);
            count += 1;
          }
          return { count };
        }
        case "move": {
          if (!input.albumId) throw new Error("Informe o album de destino.");
          const files = await getFiles(db, user.id, input.fileIds);
          for (const file of files) {
            await setFileAlbums(db, user.id, file.id, [input.albumId]);
          }
          return { count: files.length };
        }
        case "tag": {
          const files = await getFiles(db, user.id, input.fileIds);
          for (const file of files) {
            await setFileTags(db, user.id, file.id, input.tags ?? []);
          }
          return { count: files.length };
        }
        default:
          return { count: 0 };
      }
    });

    return json({ ok: true, ...result });
  } catch (error) {
    return handleError(error);
  }
}
