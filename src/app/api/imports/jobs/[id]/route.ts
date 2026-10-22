import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { getJob, listCandidates } from "@/lib/db/repo/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const payload = await withUser(user.id, async (db) => {
      const job = await getJob(db, user.id, id);
      if (!job) return null;
      const candidates = await listCandidates(db, user.id, id);
      return { job, candidates };
    });

    if (!payload) return jsonError("Importacao nao encontrada.", 404);
    return json(payload);
  } catch (error) {
    return handleError(error);
  }
}
