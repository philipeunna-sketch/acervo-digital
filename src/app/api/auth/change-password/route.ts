import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validation/schemas";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/db/repo/audit";
import { readyDb } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const limit = await rateLimit(`password:${user.id}`, { limit: 10, windowSeconds: 600 });
    if (!limit.allowed) return jsonError("Muitas alteracoes de senha. Aguarde.", 429);

    const input = await parseJsonBody(request, changePasswordSchema);
    const { getAuthAdapter } = await import("@/lib/auth/session");
    const result = await getAuthAdapter().updatePassword(input.currentPassword, input.newPassword);
    if (!result.ok) return jsonError(result.error, 400);

    const db = await readyDb();
    await logAudit(db, {
      userId: user.id,
      action: "auth.password_changed",
      entityType: "user",
      entityId: user.id,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    return json({ ok: true, user: result.user });
  } catch (error) {
    return handleError(error);
  }
}
