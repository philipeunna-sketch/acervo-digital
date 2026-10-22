import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { importCommitSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { candidatesForJob, getJob, updateJob } from "@/lib/db/repo/imports";
import { runImportJobForUser } from "@/jobs/import-job";

export const runtime = "nodejs";

/**
 * Confirma a importacao dos candidatos selecionados.
 *
 * O processamento roda em background (via `after` do Next.js) quando
 * disponivel, e o cliente acompanha o progresso pelo endpoint de status do
 * job. O fallback processa de forma sincrona, garantindo o resultado.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, importCommitSchema);

    const validation = await withUser(user.id, async (db) => {
      const job = await getJob(db, user.id, input.jobId);
      if (!job) return null;
      const candidates = await candidatesForJob(db, user.id, input.jobId, input.candidateIds);
      return { job, candidates };
    });

    if (!validation) return jsonError("Importacao nao encontrada.", 404);
    if (validation.candidates.length === 0) {
      return jsonError("Nenhum item valido selecionado para importacao.", 400);
    }

    await withUser(user.id, (db) =>
      updateJob(db, user.id, input.jobId, {
        albumId: input.albumId ?? null,
        providerId: input.providerId ?? null,
        status: "running",
      }),
    );

    const run = async (): Promise<void> => {
      await runImportJobForUser(user.id, input.jobId, input.candidateIds, {
        providerId: input.providerId ?? null,
        albumId: input.albumId ?? null,
      });
    };

    let scheduled = false;
    try {
      const { after } = await import("next/server");
      if (typeof after === "function") {
        after(async () => {
          try {
            await run();
          } catch (error) {
            console.error("[imports] job em background falhou:", error);
          }
        });
        scheduled = true;
      }
    } catch {
      scheduled = false;
    }

    if (!scheduled) {
      await run();
    }

    return json({ ok: true, jobId: input.jobId, scheduled, queued: validation.candidates.length });
  } catch (error) {
    return handleError(error);
  }
}
