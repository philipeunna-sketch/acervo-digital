import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { upsertIntegration } from "@/lib/db/repo/integrations";
import { decryptSecret } from "@/lib/security/crypto";
import { createSearchProvider } from "@/lib/integrations/search/provider";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const provider = await withUser(user.id, async (db) => {
      const rows = await db.query<{ access_token: string | null; config: Record<string, unknown> }>(
        `select access_token, config from public.integrations
          where user_id = $1 and provider = 'search' and status = 'connected' limit 1`,
        [user.id],
      );
      const row = rows[0];
      if (!row) return null;
      const apiKey = decryptSecret(row.access_token);
      const config = row.config ?? {};
      if (!apiKey || !config.provider) return null;
      return createSearchProvider(String(config.provider), apiKey, String(config.extra ?? ""));
    });

    if (!provider) return jsonError("Nenhum provedor de pesquisa configurado para este usuario.", 501);

    try {
      const results = await provider.search("teste acervo digital", 2);
      await withUser(user.id, (db) =>
        upsertIntegration(db, user.id, "search", {
          status: "connected",
          lastTestedAt: new Date().toISOString(),
          lastError: null,
        }),
      );
      return json({ ok: true, provider: provider.name, sample: results.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao consultar o provedor.";
      await withUser(user.id, (db) =>
        upsertIntegration(db, user.id, "search", {
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
