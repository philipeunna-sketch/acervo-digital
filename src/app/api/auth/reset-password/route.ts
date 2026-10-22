import { NextResponse } from "next/server";
import { getAuthAdapter } from "@/lib/auth/session";
import { resetPasswordSchema } from "@/lib/validation/schemas";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const limit = await rateLimit(`reset:${clientIdentifier(request)}`, { limit: 10, windowSeconds: 600 });
    if (!limit.allowed) {
      return jsonError("Muitas tentativas. Tente novamente mais tarde.", 429);
    }

    const input = await parseJsonBody(request, resetPasswordSchema);
    const result = await getAuthAdapter().resetPassword(input.token, input.password);
    if (!result.ok) return jsonError(result.error, 400);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
