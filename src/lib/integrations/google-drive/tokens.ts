import type { Db } from "@/lib/db/client";
import { getIntegration, upsertIntegration } from "@/lib/db/repo/integrations";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { refreshAccessToken } from "@/lib/integrations/google-drive/client";

/**
 * Obtem (e renova quando necessario) o token de acesso do Google Drive.
 * Os tokens ficam cifrados no banco e nunca sao expostos ao navegador.
 */
export async function getDriveAccessToken(db: Db, userId: string): Promise<string> {
  const integration = await getIntegration(db, userId, "google_drive");
  if (!integration || integration.status !== "connected") {
    throw new Error("Google Drive nao esta conectado.");
  }

  const accessToken = decryptSecret(integration.access_token);
  const refreshToken = decryptSecret(integration.refresh_token);
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  const stillValid = accessToken && expiresAt - Date.now() > 60_000;

  if (stillValid) return accessToken;
  if (!refreshToken) {
    throw new Error("Sessao do Google Drive expirada. Conecte novamente.");
  }

  const tokens = await refreshAccessToken(refreshToken);
  await upsertIntegration(db, userId, "google_drive", {
    accessToken: encryptSecret(tokens.accessToken),
    expiresAt: tokens.expiresAt,
    lastTestedAt: new Date().toISOString(),
    lastError: null,
  });
  return tokens.accessToken;
}
