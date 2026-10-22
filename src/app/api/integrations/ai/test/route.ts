import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { upsertIntegration } from "@/lib/db/repo/integrations";
import { decryptSecret } from "@/lib/security/crypto";
import { buildProvider } from "@/lib/integrations/ai/provider";

export const runtime = "nodejs";

/** Testa o provedor de IA configurado (usuario ou ambiente). */
export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const provider = await withUser(user.id, async (db) => {
      const integration = await db.query<{
        access_token: string | null;
        config: Record<string, unknown>;
      }>(
        `select access_token, config from public.integrations
          where user_id = $1 and provider = 'ai' and status = 'connected' limit 1`,
        [user.id],
      );
      const row = integration[0];
      if (!row) return null;
      const apiKey = decryptSecret(row.access_token);
      const config = row.config ?? {};
      if (!apiKey || !config.model) return null;
      return buildProvider({
        provider: String(config.provider ?? "openai"),
        apiKey,
        baseUrl: String(config.baseUrl ?? "https://api.openai.com/v1"),
        model: String(config.model),
      });
    });

    if (!provider) {
      return jsonError("Nenhum provedor de IA configurado para este usuario.", 501);
    }

    try {
      const answer = await provider.complete([{ role: "user", content: "Responda apenas: OK" }], { maxTokens: 20 });
      await withUser(user.id, (db) =>
        upsertIntegration(db, user.id, "ai", {
          status: "connected",
          lastTestedAt: new Date().toISOString(),
          lastError: null,
        }),
      );
      return json({ ok: true, model: provider.model, sample: answer.slice(0, 40) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao consultar o provedor de IA.";
      await withUser(user.id, (db) =>
        upsertIntegration(db, user.id, "ai", {
          status: "requires_config",
          lastTestedAt: new Date().toISOString(),
          lastError: message.slice(0, 400),
        }),
      );
      return jsonError(message, 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
