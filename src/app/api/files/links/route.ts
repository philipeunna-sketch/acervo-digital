import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { z } from "zod";
import { withUser } from "@/lib/db/client";
import { getFiles } from "@/lib/db/repo/files";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

const linksSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(120),
  download: z.boolean().optional(),
});

/**
 * Gera URLs assinadas em lote para miniaturas/pre-visualizacao.
 * Evita uma requisicao por arquivo na interface.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, linksSchema);

    const result = await withUser(user.id, async (db) => {
      const files = await getFiles(db, user.id, input.ids);
      const ttl = getEnv().SIGNED_URL_TTL;
      const links: Array<{ id: string; url: string; mimeType: string; name: string }> = [];

      for (const file of files) {
        try {
          const provider = await resolveStorageProvider(db, user.id, file.provider_id);
          const url = await provider.signDownload({
            key: file.storage_key,
            expiresIn: ttl,
            filename: file.name,
            contentType: file.mime_type,
            download: input.download ?? false,
          });
          links.push({ id: file.id, url, mimeType: file.mime_type, name: file.name });
        } catch (error) {
          console.error(
            `[links] falha ao assinar ${file.name}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }
      return links;
    });

    return json({ links: result });
  } catch (error) {
    return handleError(error);
  }
}
