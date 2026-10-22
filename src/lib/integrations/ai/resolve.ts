import type { Db } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/repo/integrations";
import { decryptSecret } from "@/lib/security/crypto";
import { buildProvider, envAiProvider, type AiProvider } from "@/lib/integrations/ai/provider";

/**
 * Provedor de IA efetivo: configuracao do usuario tem precedencia sobre o
 * ambiente. A chave da API nunca e exposta ao navegador.
 */
export async function resolveAiProvider(db: Db, userId: string): Promise<AiProvider | null> {
  const integration = await getIntegration(db, userId, "ai");
  if (integration?.status === "connected") {
    const apiKey = decryptSecret(integration.access_token);
    const config = (integration.config ?? {}) as {
      provider?: string;
      model?: string;
      baseUrl?: string;
    };
    if (apiKey && config.model) {
      return buildProvider({
        provider: config.provider ?? "openai",
        apiKey,
        baseUrl: config.baseUrl ?? "https://api.openai.com/v1",
        model: config.model,
      });
    }
  }
  return envAiProvider();
}
