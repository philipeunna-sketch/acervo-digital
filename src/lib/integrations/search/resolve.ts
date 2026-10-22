import type { Db } from "@/lib/db/client";
import { getIntegration } from "@/lib/db/repo/integrations";
import { decryptSecret } from "@/lib/security/crypto";
import { createSearchProvider, envSearchProvider, type SearchProvider } from "@/lib/integrations/search/provider";

/** Provedor de pesquisa efetivo (configuracao do usuario > ambiente). */
export async function resolveSearchProvider(db: Db, userId: string): Promise<SearchProvider | null> {
  const integration = await getIntegration(db, userId, "search");
  if (integration?.status === "connected") {
    const apiKey = decryptSecret(integration.access_token);
    const config = (integration.config ?? {}) as { provider?: string; extra?: string };
    if (apiKey && config.provider) {
      const provider = createSearchProvider(config.provider, apiKey, config.extra);
      if (provider) return provider;
    }
  }
  return envSearchProvider();
}
