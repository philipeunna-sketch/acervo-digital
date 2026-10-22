import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { telegramConfigSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { upsertIntegration } from "@/lib/db/repo/integrations";
import { encryptSecret } from "@/lib/security/crypto";
import { getBotInfo, getChat } from "@/lib/integrations/telegram/client";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/** Salva (ou atualiza) a configuracao do Telegram. O token e cifrado no banco. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, telegramConfigSchema);

    const bot = await getBotInfo(input.botToken);
    let chatLabel = input.chatId;
    try {
      const chat = await getChat(input.botToken, input.chatId);
      chatLabel = chat.title ?? chat.type ?? input.chatId;
    } catch (error) {
      return jsonError(
        `O bot responde, mas o chat informado nao e acessivel: ${error instanceof Error ? error.message : "erro"}`,
        400,
      );
    }

    await withUser(user.id, async (db) => {
      await upsertIntegration(db, user.id, "telegram", {
        status: "connected",
        accessToken: encryptSecret(input.botToken),
        config: { chatId: input.chatId },
        accountLabel: `@${bot.username}`,
        accountEmail: null,
        lastTestedAt: new Date().toISOString(),
        lastError: null,
      });
      await logAudit(db, {
        userId: user.id,
        action: "integration.telegram.saved",
        entityType: "integration",
        entityId: "telegram",
        metadata: { bot: bot.username },
      });
    });

    return json({ ok: true, bot: { id: bot.id, username: bot.username }, chat: chatLabel });
  } catch (error) {
    return handleError(error);
  }
}
