import { NextResponse } from "next/server";
import { getAuthAdapter } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { ensureSchema } from "@/lib/db/migrate";
import { loginSchema } from "@/lib/validation/schemas";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { logAudit } from "@/lib/db/repo/audit";
import { readyDb } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await ensureSchema();

    const limit = await rateLimit(`login:${clientIdentifier(request)}`, { limit: 10, windowSeconds: 300 });
    if (!limit.allowed) {
      return jsonError("Muitas tentativas de login. Tente novamente em alguns minutos.", 429);
    }

    const input = await parseJsonBody(request, loginSchema);

    // Garante a existencia da conta administrativa inicial (uma unica vez).
    try {
      await ensureBootstrap();
    } catch (error) {
      console.error("[auth] bootstrap falhou:", error instanceof Error ? error.message : error);
    }

    const result = await getAuthAdapter().signIn(input.email, input.password);
    if (!result.ok) {
      const db = await readyDb();
      await logAudit(db, {
        userId: null,
        action: "auth.login_failed",
        entityType: "user",
        entityId: input.email,
        metadata: { reason: result.code ?? "invalid_credentials" },
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
      return jsonError(result.error, 401);
    }

    const db = await readyDb();
    await logAudit(db, {
      userId: result.user.id,
      action: "auth.login",
      entityType: "user",
      entityId: result.user.id,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    return json({ user: result.user, mustChangePassword: result.user.mustChangePassword });
  } catch (error) {
    return handleError(error);
  }
}
