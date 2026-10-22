import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { json, jsonError, parseJsonBody } from "@/lib/api/http";
import { aiConfigSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { upsertIntegration } from "@/lib/db/repo/integrations";
import { encryptSecret } from "@/lib/security/crypto";
import { buildProvider } from "@/lib/integrations/ai/provider";

export const runtime = "nodejs";

/** Salva a configuracao do provedor de IA para o usuario (chave cifrada). */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError("Nao autenticado.", 401);

  try {
    const input = await parseJsonBody(request, aiConfigSchema);

    const provider = buildProvider({
      provider: input.provider,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl || "https://api.openai.com/v1",
      model: input.model,
    });

    const answer = await provider.complete(
      [{ role: "user", content: "Responda apenas com a palavra: OK" }],
      { maxTokens: 20 },
    );

    await withUser(user.id, async (db) => {
      await upsertIntegration(db, user.id, "ai", {
        status: "connected",
        accessToken: encryptSecret(input.apiKey),
        config: {
          provider: input.provider,
          model: input.model,
          baseUrl: input.baseUrl || "https://api.openai.com/v1",
        },
        accountLabel: `${input.provider} / ${input.model}`,
        lastTestedAt: new Date().toISOString(),
        lastError: null,
      });
    });

    return json({ ok: true, model: input.model, sample: answer.slice(0, 40) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar o provedor de IA.";
    await withUser(user.id, async (db) => {
      await upsertIntegration(db, user.id, "ai", {
        status: "requires_config",
        lastTestedAt: new Date().toISOString(),
        lastError: message.slice(0, 400),
      });
    }).catch(() => undefined);
    return jsonError(message, 400);
  }
}
