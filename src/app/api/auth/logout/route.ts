import { NextResponse } from "next/server";
import { getAuthAdapter } from "@/lib/auth/session";
import { handleError, json } from "@/lib/api/http";
import { logAudit } from "@/lib/db/repo/audit";
import { readyDb } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    await getAuthAdapter().signOut();
    if (user) {
      const db = await readyDb();
      await logAudit(db, { userId: user.id, action: "auth.logout", entityType: "user", entityId: user.id });
    }
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
