import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { analyzeUrlSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { createCandidates, createJob, updateJob } from "@/lib/db/repo/imports";
import { analyzeUrl } from "@/lib/integrations/url-analysis";
import { resolveAiProvider } from "@/lib/integrations/ai/resolve";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/db/repo/audit";
import { assertSafeUrlShape } from "@/lib/security/ssrf";

export const runtime = "nodejs";

/**
 * Modo B - analise de URL.
 *
 * A URL e validada (esquema, host e resolucao DNS) antes de qualquer
 * requisicao. As midias sao apenas as que a propria origem disponibiliza de
 * forma publica ou via API oficial do servico.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const limit = await rateLimit(`analyze:${clientIdentifier(request, user.id)}`, { limit: 20, windowSeconds: 60 });
    if (!limit.allowed) return jsonError("Limite de analises atingido. Aguarde.", 429);

    const input = await parseJsonBody(request, analyzeUrlSchema);

    // Validacao de formato (o SSRF completo acontece no fetch seguro).
    assertSafeUrlShape(input.url);

    const aiProvider = await withUser(user.id, (db) => resolveAiProvider(db, user.id));
    const analysis = await analyzeUrl(input.url, aiProvider);

    const payload = await withUser(user.id, async (db) => {
      const job = await createJob(db, {
        userId: user.id,
        mode: "url",
        url: input.url,
        provider: analysis.source.label,
        aiModel: analysis.aiModel,
      });

      const candidates = await createCandidates(
        db,
        analysis.candidates.map((candidate) => ({
          jobId: job.id,
          mediaType: candidate.mediaType,
          title: candidate.title,
          description: candidate.description,
          sourceUrl: candidate.sourceUrl,
          downloadUrl: candidate.downloadUrl,
          thumbnailUrl: candidate.thumbnailUrl,
          mimeType: candidate.mimeType,
          sizeBytes: candidate.sizeBytes,
          width: candidate.width,
          height: candidate.height,
          durationSeconds: candidate.durationSeconds,
          suggestedName: candidate.suggestedName,
          suggestedTags: candidate.suggestedTags,
          aiConfidence: candidate.aiConfidence,
        })),
      );

      await updateJob(db, user.id, job.id, {
        status: "completed",
        stats: {
          candidates: candidates.length,
          usedAi: analysis.usedAi,
          source: analysis.source.kind,
        },
        completedAt: new Date().toISOString(),
      });

      await logAudit(db, {
        userId: user.id,
        action: "import.analyze",
        entityType: "import_job",
        entityId: job.id,
        metadata: { url: input.url, candidates: candidates.length },
      });

      return { job, candidates };
    });

    return json({
      ...payload,
      page: analysis.page,
      source: analysis.source,
      notes: analysis.notes,
      usedAi: analysis.usedAi,
      aiModel: analysis.aiModel,
    });
  } catch (error) {
    return handleError(error);
  }
}
