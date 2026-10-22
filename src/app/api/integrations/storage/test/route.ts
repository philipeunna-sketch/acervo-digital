import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { resolveStorageProvider, invalidateStorageCache } from "@/lib/storage/registry";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/** Testa a conexao com um provedor de armazenamento. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const url = new URL(request.url);
    const providerId = url.searchParams.get("providerId");

    const result = await withUser(user.id, async (db) => {
      const provider = await resolveStorageProvider(db, user.id, providerId);
      invalidateStorageCache(provider.id);
      const health = await provider.healthCheck();

      if (provider.id) {
        await db.query(
          `update public.storage_providers set last_tested_at = now(), last_error = $2, updated_at = now()
            where id = $1`,
          [provider.id, health.ok ? null : health.message.slice(0, 400)],
        );
      }

      await logAudit(db, {
        userId: user.id,
        action: "integration.storage.tested",
        entityType: "storage_provider",
        entityId: provider.id ?? null,
        metadata: { ok: health.ok },
      });

      return { ...health, provider: { id: provider.id ?? null, name: provider.name, kind: provider.kind } };
    });

    if (!result.ok) return jsonError(result.message, 400);
    return json(result);
  } catch (error) {
    return handleError(error);
  }
}
