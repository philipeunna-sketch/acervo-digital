import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { deletePermanently } from "@/lib/db/repo/files";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Exclusao definitiva: remove os metadados e o objeto do storage.
 * A confirmacao e exigida no cliente (`confirm: true`).
 */
export async function DELETE(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const url = new URL(request.url);
    if (url.searchParams.get("confirm") !== "true") {
      return jsonError("Confirmacao exigida para exclusao definitiva.", 400);
    }

    const result = await withUser(user.id, async (db) => {
      const deleted = await deletePermanently(db, user.id, [id]);
      if (deleted.length === 0) return { deleted: false, removed: 0 };

      let removed = 0;
      for (const file of deleted) {
        try {
          const provider = await resolveStorageProvider(db, user.id, file.provider_id);
          await provider.deleteObject(file.storage_key);
          removed += 1;
        } catch (error) {
          console.error(
            `[files] nao foi possivel remover o objeto ${file.storage_key}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      await logAudit(db, {
        userId: user.id,
        action: "file.deleted_permanently",
        entityType: "file",
        entityId: id,
        metadata: { name: deleted[0]?.name, objectRemoved: removed },
      });
      return { deleted: true, removed };
    });

    if (!result.deleted) return jsonError("Arquivo nao encontrado.", 404);
    return json({ ok: true, objectsRemoved: result.removed });
  } catch (error) {
    return handleError(error);
  }
}
