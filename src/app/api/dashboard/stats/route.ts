import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { dashboardStats } from "@/lib/db/repo/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const stats = await withUser(user.id, (db) => dashboardStats(db, user.id));
    return json(stats);
  } catch (error) {
    return handleError(error);
  }
}
