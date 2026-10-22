import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, jsonError } from "@/lib/api/http";
import { buildAuthorizeUrl, googleDriveConfig } from "@/lib/integrations/google-drive/client";
import { createOAuthState } from "@/lib/integrations/google-drive/oauth-state";

export const runtime = "nodejs";

/** Inicia o fluxo OAuth 2.0 do Google Drive. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      const url = new URL(request.url);
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname)}`, url.origin));
    }

    if (!googleDriveConfig()) {
      return jsonError(
        "Google Drive nao configurado. Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI.",
        501,
      );
    }

    const state = await createOAuthState();
    const authorizeUrl = buildAuthorizeUrl(state);
    if (!authorizeUrl) return jsonError("Nao foi possivel montar a URL de autorizacao.", 500);

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    return handleError(error);
  }
}
