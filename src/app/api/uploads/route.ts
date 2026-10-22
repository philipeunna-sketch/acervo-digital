import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { listUploadSessions } from "@/lib/db/repo/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const url = new URL(request.url);
    const statuses = url.searchParams.get("statuses");
    const limit = Number(url.searchParams.get("limit") ?? 50) || 50;

    const sessions = await withUser(user.id, (db) =>
      listUploadSessions(db, user.id, {
        statuses: statuses ? (statuses.split(",") as never) : undefined,
        limit,
      }),
    );

    return json({ sessions });
  } catch (error) {
    return handleError(error);
  }
}
