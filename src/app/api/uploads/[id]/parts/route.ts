import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { uploadPartSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { getUploadSession, updateUploadSession } from "@/lib/db/repo/uploads";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Emite URLs assinadas de upload para as partes solicitadas.
 * O cliente solicita as partes em lotes, respeitando o limite de
 * `MULTIPART_MAX_PARTS` para nao sobrecarregar o provedor.
 */
export async function POST(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const input = await parseJsonBody(request, uploadPartSchema);

    const env = getEnv();
    if (input.partNumbers.length > env.MULTIPART_MAX_PARTS) {
      return jsonError(`Solicite no maximo ${env.MULTIPART_MAX_PARTS} partes por vez.`, 400);
    }

    const payload = await withUser(user.id, async (db): Promise<
      | { kind: "urls"; urls: Array<{ partNumber: number; url: string }> }
      | { kind: "error"; error: string; status: number }
    > => {
      const session = await getUploadSession(db, user.id, id);
      if (!session) return { kind: "error", error: "Sessao de upload nao encontrada.", status: 404 };
      if (!session.multipart_upload_id) {
        return { kind: "error", error: "Sessao de upload nao usa multipart.", status: 400 };
      }
      if (session.status === "completed" || session.status === "canceled") {
        return { kind: "error", error: "Sessao de upload ja finalizada.", status: 409 };
      }

      const provider = await resolveStorageProvider(db, user.id, session.provider_id);
      const urls: Array<{ partNumber: number; url: string }> = [];
      for (const partNumber of input.partNumbers) {
        const url = await provider.signUploadPart({
          key: session.storage_key,
          uploadId: session.multipart_upload_id,
          partNumber,
        });
        urls.push({ partNumber, url });
      }

      await updateUploadSession(db, user.id, id, { status: "uploading" });
      return { kind: "urls", urls };
    });

    if (payload.kind === "error") return jsonError(payload.error, payload.status);
    return json({ urls: payload.urls });
  } catch (error) {
    return handleError(error);
  }
}
