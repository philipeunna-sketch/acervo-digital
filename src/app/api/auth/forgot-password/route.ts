import { NextResponse } from "next/server";
import { getAuthAdapter } from "@/lib/auth/session";
import { forgotPasswordSchema } from "@/lib/validation/schemas";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";
import { sendPasswordResetEmail } from "@/lib/integrations/email";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const limit = await rateLimit(`forgot:${clientIdentifier(request)}`, { limit: 5, windowSeconds: 600 });
    if (!limit.allowed) {
      return jsonError("Muitas solicitacoes. Tente novamente mais tarde.", 429);
    }

    const input = await parseJsonBody(request, forgotPasswordSchema);
    const result = await getAuthAdapter().requestPasswordReset(input.email);

    // Em desenvolvimento o link e devolvido para permitir o fluxo completo.
    const devLink =
      result.devToken && process.env.NODE_ENV !== "production"
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password?token=${result.devToken}`
        : undefined;

    if (result.devToken) {
      await sendPasswordResetEmail(input.email, devLink);
    }

    return json({ message: result.message, ...(devLink ? { devLink } : {}) });
  } catch (error) {
    return handleError(error);
  }
}
