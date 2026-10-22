import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { upsertIntegration } from "@/lib/db/repo/integrations";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/** Revoga a conexao local e orienta a revogacao no Google. */
export async function POST(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    await withUser(user.id, async (db) => {
      await upsertIntegration(db, user.id, "google_drive", {
        status: "disconnected",
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        accountEmail: null,
        accountLabel: null,
      });
      await logAudit(db, {
        userId: user.id,
        action: "integration.google_drive.disconnected",
        entityType: "integration",
        entityId: "google_drive",
      });
    });

    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
