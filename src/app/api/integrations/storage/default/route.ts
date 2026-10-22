import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { getProviderRow, invalidateStorageCache } from "@/lib/storage/registry";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/** Define o provedor de armazenamento principal. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const url = new URL(request.url);
    const providerId = url.searchParams.get("providerId");
    if (!providerId) return jsonError("Informe o provedor.", 400);

    const updated = await withUser(user.id, async (db) => {
      const row = await getProviderRow(db, user.id, providerId);
      if (!row) return false;
      await db.query(
        `update public.storage_providers set is_default = false
          where (user_id = $1 or is_system = true) and id <> $2`,
        [user.id, providerId],
      );
      await db.query(`update public.storage_providers set is_default = true, updated_at = now() where id = $1`, [
        providerId,
      ]);
      await logAudit(db, {
        userId: user.id,
        action: "integration.storage.default_changed",
        entityType: "storage_provider",
        entityId: providerId,
        metadata: { name: row.name },
      });
      return true;
    });

    if (!updated) return jsonError("Provedor nao encontrado.", 404);
    invalidateStorageCache();
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
