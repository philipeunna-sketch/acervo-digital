import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { getDriveAccessToken } from "@/lib/integrations/google-drive/tokens";
import { listDriveFiles } from "@/lib/integrations/google-drive/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const url = new URL(request.url);
    const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") ?? 50) || 50);
    const pageToken = url.searchParams.get("pageToken") ?? undefined;
    const query = url.searchParams.get("q") ?? undefined;

    const result = await withUser(user.id, async (db) => {
      const accessToken = await getDriveAccessToken(db, user.id);
      return listDriveFiles(accessToken, { pageSize, pageToken, query });
    });

    return json(result);
  } catch (error) {
    return handleError(error);
  }
}
