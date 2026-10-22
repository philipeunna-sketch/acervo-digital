import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { exchangeCode } from "@/lib/integrations/google-drive/client";
import { withUser } from "@/lib/db/client";
import { upsertIntegration } from "@/lib/db/repo/integrations";
import { encryptSecret } from "@/lib/security/crypto";
import { consumeOAuthState } from "@/lib/integrations/google-drive/oauth-state";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/** Callback do OAuth do Google Drive: troca o code por tokens e os persiste cifrados. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const redirect = (message: string, ok = false): NextResponse => {
      const target = new URL("/integracoes", url.origin);
      target.searchParams.set("drive", ok ? "connected" : "error");
      target.searchParams.set("message", message);
      return NextResponse.redirect(target);
    };

    if (!user) return redirect("Sessao expirada durante a autorizacao.");
    if (error) return redirect(`Autorizacao negada: ${error}`);
    if (!code || !state) return redirect("Resposta invalida do Google.");

    const validState = await consumeOAuthState(state);
    if (!validState) return redirect("Estado OAuth invalido (possuivel CSRF).");

    const tokens = await exchangeCode(code);

    await withUser(user.id, async (db) => {
      await upsertIntegration(db, user.id, "google_drive", {
        status: "connected",
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        expiresAt: tokens.expiresAt,
        scopes: tokens.scope,
        accountLabel: "Google Drive",
        lastError: null,
        lastTestedAt: new Date().toISOString(),
      });
      await logAudit(db, {
        userId: user.id,
        action: "integration.google_drive.connected",
        entityType: "integration",
        entityId: "google_drive",
      });
    });

    return redirect("Google Drive conectado com sucesso.", true);  } catch (error) {
    const url = new URL(request.url);
    const target = new URL("/integracoes", url.origin);
    target.searchParams.set("drive", "error");
    target.searchParams.set(
      "message",
      error instanceof Error ? error.message : "Falha ao concluir a autorizacao.",
    );
    return NextResponse.redirect(target);
  }
}
