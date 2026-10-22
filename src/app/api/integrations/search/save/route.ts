import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { json, jsonError, parseJsonBody } from "@/lib/api/http";
import { searchConfigSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { upsertIntegration } from "@/lib/db/repo/integrations";
import { encryptSecret } from "@/lib/security/crypto";
import { createSearchProvider } from "@/lib/integrations/search/provider";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError("Nao autenticado.", 401);

  try {
    const input = await parseJsonBody(request, searchConfigSchema);

    const provider = createSearchProvider(input.provider, input.apiKey, input.extra);
    if (!provider) return jsonError("Provedor de pesquisa invalido.", 400);

    const results = await provider.search("acervo digital", 3);

    await withUser(user.id, async (db) => {
      await upsertIntegration(db, user.id, "search", {
        status: "connected",
        accessToken: encryptSecret(input.apiKey),
        config: { provider: input.provider, extra: input.extra ?? "" },
        accountLabel: input.provider,
        lastTestedAt: new Date().toISOString(),
        lastError: null,
      });
    });

    return json({ ok: true, provider: input.provider, sample: results.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar o provedor de pesquisa.";
    await withUser(user.id, async (db) => {
      await upsertIntegration(db, user.id, "search", {
        status: "requires_config",
        lastTestedAt: new Date().toISOString(),
        lastError: message.slice(0, 400),
      });
    }).catch(() => undefined);
    return jsonError(message, 400);
  }
}
