import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { getIntegration, upsertIntegration } from "@/lib/db/repo/integrations";
import { decryptSecret } from "@/lib/security/crypto";
import { getBotInfo } from "@/lib/integrations/telegram/client";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

/** Testa a conexao com o Telegram usando o token salvo (ou o do ambiente). */
export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const token = await withUser(user.id, async (db) => {
      const integration = await getIntegration(db, user.id, "telegram");
      const stored = decryptSecret(integration?.access_token);
      return stored || getEnv().TELEGRAM_BOT_TOKEN || "";
    });

    if (!token) {
      return jsonError("Telegram nao configurado: informe o token do bot.", 501);
    }

    try {
      const bot = await getBotInfo(token);
      await withUser(user.id, (db) =>
        upsertIntegration(db, user.id, "telegram", {
          status: "connected",
          lastTestedAt: new Date().toISOString(),
          lastError: null,
        }),
      );
      return json({ ok: true, bot: { id: bot.id, username: bot.username, firstName: bot.firstName } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao contatar o Telegram.";
      await withUser(user.id, (db) =>
        upsertIntegration(db, user.id, "telegram", {
          status: "requires_config",
          lastTestedAt: new Date().toISOString(),
          lastError: message,
        }),
      );
      return jsonError(message, 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
