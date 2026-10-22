import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { telegramSendSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/repo/integrations";
import { decryptSecret } from "@/lib/security/crypto";
import { sendDocument, sendPhoto, sendVideo } from "@/lib/integrations/telegram/client";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { getFiles } from "@/lib/db/repo/files";
import { LocalStorageProvider } from "@/lib/storage/local";
import { getEnv } from "@/lib/env";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/**
 * Envia arquivos selecionados para um chat do Telegram.
 *
 * O Telegram recebe uma COPIA do arquivo; o arquivo original permanece no
 * armazenamento do acervo. Limites de tamanho da Bot API sao informados.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, telegramSendSchema);

    const result = await withUser(user.id, async (db) => {
      const integration = await getIntegration(db, user.id, "telegram");
      const token = decryptSecret(integration?.access_token) || getEnv().TELEGRAM_BOT_TOKEN || "";
      if (!token) throw new Error("Telegram nao configurado.");

      const chatId =
        input.chatId ?? (typeof integration?.config?.chatId === "string" ? integration.config.chatId : "");
      if (!chatId) throw new Error("Informe o chat de destino.");

      const files = await getFiles(db, user.id, input.fileIds);
      const results: Array<{ fileId: string; name: string; ok: boolean; message: string }> = [];

      for (const file of files) {
        try {
          const provider = await resolveStorageProvider(db, user.id, file.provider_id);
          let data: Uint8Array;

          if (provider instanceof LocalStorageProvider) {
            const chunks: Buffer[] = [];
            for await (const chunk of provider.createReadStream(file.storage_key)) {
              chunks.push(Buffer.from(chunk));
            }
            data = new Uint8Array(Buffer.concat(chunks));
          } else {
            const signed = await provider.signDownload({ key: file.storage_key, expiresIn: 300 });
            const response = await fetch(signed);
            if (!response.ok) throw new Error("Falha ao baixar o arquivo do storage.");
            data = new Uint8Array(await response.arrayBuffer());
          }

          const payload = { data, filename: file.name, contentType: file.mime_type };
          const sent =
            file.category === "image"
              ? await sendPhoto(token, chatId, payload, file.description ?? undefined)
              : file.category === "video"
                ? await sendVideo(token, chatId, payload, file.description ?? undefined)
                : await sendDocument(token, chatId, payload, file.description ?? undefined);

          results.push({
            fileId: file.id,
            name: file.name,
            ok: sent.ok,
            message: sent.ok ? `Enviado (copia). ${sent.description}` : sent.description,
          });
        } catch (error) {
          results.push({
            fileId: file.id,
            name: file.name,
            ok: false,
            message: error instanceof Error ? error.message : "Falha ao enviar.",
          });
        }
      }

      await logAudit(db, {
        userId: user.id,
        action: "integration.telegram.sent",
        entityType: "integration",
        entityId: "telegram",
        metadata: { count: results.length, ok: results.filter((r) => r.ok).length },
      });

      return { results, chatId };
    });

    return json({ ok: true, ...result });
  } catch (error) {
    return handleError(error);
  }
}
