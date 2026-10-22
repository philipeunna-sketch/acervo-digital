import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { getFile } from "@/lib/db/repo/files";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { getEnv } from "@/lib/env";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Gera uma URL assinada e temporaria para acessar o arquivo.
 * Arquivos privados nunca sao expostos publicamente.
 */
export async function GET(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    const expiresIn = Math.min(3600, Math.max(60, Number(url.searchParams.get("ttl") ?? 0) || getEnv().SIGNED_URL_TTL));

    const payload = await withUser(user.id, async (db) => {
      const file = await getFile(db, user.id, id);
      if (!file) return null;
      const provider = await resolveStorageProvider(db, user.id, file.provider_id);
      const signed = await provider.signDownload({
        key: file.storage_key,
        expiresIn,
        filename: file.name,
        contentType: file.mime_type,
        download,
      });
      await logAudit(db, {
        userId: user.id,
        action: download ? "file.download_link" : "file.preview_link",
        entityType: "file",
        entityId: id,
        metadata: { name: file.name, expiresIn },
      });
      return { url: signed, expiresIn };
    });

    if (!payload) return jsonError("Arquivo nao encontrado.", 404);
    return json(payload);
  } catch (error) {
    return handleError(error);
  }
}
