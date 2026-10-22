import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { keywordSearchSchema } from "@/lib/validation/schemas";
import type { SearchResult } from "@/lib/integrations/search/provider";
import { resolveSearchProvider } from "@/lib/integrations/search/resolve";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { withUser } from "@/lib/db/client";
import { createJob } from "@/lib/db/repo/imports";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/**
 * Modo A - pesquisa por palavra-chave.
 * Utiliza um provedor de pesquisa efetivamente configurado; caso nenhum
 * esteja disponivel, a API informa o que falta (nenhum resultado simulado).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const limit = await rateLimit(`search:${clientIdentifier(request, user.id)}`, { limit: 30, windowSeconds: 60 });
    if (!limit.allowed) return jsonError("Limite de consultas atingido. Aguarde.", 429);

    const input = await parseJsonBody(request, keywordSearchSchema);
    const provider = await withUser(user.id, (db) => resolveSearchProvider(db, user.id));

    if (!provider || !provider.isConfigured()) {
      return jsonError(
        "Nenhum provedor de pesquisa esta configurado. Defina BRAVE_SEARCH_API_KEY, TAVILY_API_KEY ou SERPER_API_KEY (veja a pagina Integracoes).",
        501,
      );
    }

    let results: SearchResult[];
    try {
      results = await provider.search(input.query, input.limit ?? 10);
    } catch (error) {
      return jsonError(
        `O provedor de pesquisa falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`,
        502,
      );
    }

    const job = await withUser(user.id, async (db) => {
      const created = await createJob(db, {
        userId: user.id,
        mode: "search",
        query: input.query,
        provider: provider.name,
      });
      await logAudit(db, {
        userId: user.id,
        action: "import.search",
        entityType: "import_job",
        entityId: created.id,
        metadata: { query: input.query, results: results.length },
      });
      return created;
    });

    return json({ job, provider: provider.name, results });
  } catch (error) {
    return handleError(error);
  }
}
