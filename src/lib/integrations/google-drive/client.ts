import { getEnv } from "@/lib/env";

/**
 * Cliente do Google Drive API v3 + fluxo OAuth 2.0 (authorization code).
 *
 * O `client_secret` e o `refresh_token` ficam somente no servidor e sao
 * cifrados antes de serem persistidos (ver `lib/db/repo/integrations`).
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export function googleDriveConfig(): GoogleDriveConfig | null {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      env.GOOGLE_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/integrations/google-drive/callback`,
    scopes: (env.GOOGLE_SCOPES ??
      "https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/drive.file")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}

export function googleDriveEnabled(): boolean {
  const env = getEnv();
  return env.GOOGLE_DRIVE_ENABLED !== false && googleDriveConfig() !== null;
}

export function buildAuthorizeUrl(state: string): string | null {
  const config = googleDriveConfig();
  if (!config) return null;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: config.scopes.join(" "),
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const config = googleDriveConfig();
  if (!config) throw new Error("Google Drive nao configurado.");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google OAuth respondeu ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null,
    scope: payload.scope ?? null,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const config = googleDriveConfig();
  if (!config) throw new Error("Google Drive nao configurado.");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Renovacao do token do Google falhou (${response.status}): ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { access_token: string; expires_in?: number; scope?: string };
  return {
    accessToken: payload.access_token,
    refreshToken: null,
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null,
    scope: payload.scope ?? null,
  };
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  createdTime: string | null;
  thumbnailUrl: string | null;
  webViewLink: string | null;
  owners: string[];
  shared: boolean;
}

interface DriveListResponse {
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    createdTime?: string;
    thumbnailLink?: string;
    webViewLink?: string;
    owners?: Array<{ emailAddress?: string }>;
    shared?: boolean;
  }>;
  nextPageToken?: string;
}

export async function listDriveFiles(
  accessToken: string,
  options: { query?: string; pageSize?: number; pageToken?: string; orderBy?: string } = {},
): Promise<{ files: DriveFile[]; nextPageToken: string | null }> {
  const params = new URLSearchParams({
    pageSize: String(Math.min(100, options.pageSize ?? 50)),
    fields:
      "nextPageToken, files(id,name,mimeType,size,modifiedTime,createdTime,thumbnailLink,webViewLink,owners,shared)",
    orderBy: options.orderBy ?? "modifiedTime desc",
    q:
      options.query ??
      "trashed = false and mimeType != 'application/vnd.google-apps.folder' and mimeType != 'application/vnd.google-apps.shortcut'",
  });
  if (options.pageToken) params.set("pageToken", options.pageToken);

  const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Drive API respondeu ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as DriveListResponse;
  return {
    files: (payload.files ?? []).map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size ? Number(file.size) : null,
      modifiedTime: file.modifiedTime ?? null,
      createdTime: file.createdTime ?? null,
      thumbnailUrl: file.thumbnailLink ?? null,
      webViewLink: file.webViewLink ?? null,
      owners: (file.owners ?? []).map((owner) => owner.emailAddress ?? "").filter(Boolean),
      shared: Boolean(file.shared),
    })),
    nextPageToken: payload.nextPageToken ?? null,
  };
}

export async function getDriveFile(accessToken: string, fileId: string): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,size,modifiedTime,createdTime,thumbnailLink,webViewLink,owners,shared",
  });
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Drive API respondeu ${response.status}.`);
  const file = (await response.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime?: string;
    createdTime?: string;
    thumbnailLink?: string;
    webViewLink?: string;
    owners?: Array<{ emailAddress?: string }>;
    shared?: boolean;
  };
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size ? Number(file.size) : null,
    modifiedTime: file.modifiedTime ?? null,
    createdTime: file.createdTime ?? null,
    thumbnailUrl: file.thumbnailLink ?? null,
    webViewLink: file.webViewLink ?? null,
    owners: (file.owners ?? []).map((owner) => owner.emailAddress ?? "").filter(Boolean),
    shared: Boolean(file.shared),
  };
}

export async function downloadDriveFile(accessToken: string, fileId: string): Promise<Response> {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Nao foi possivel baixar o arquivo do Drive (${response.status}). Verifique as permissoes concedidas.`,
    );
  }
  return response;
}

/** Copia um arquivo dentro do Drive (mesma conta). */
export async function copyDriveFile(
  accessToken: string,
  fileId: string,
  name?: string,
): Promise<DriveFile | null> {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/copy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const file = (await response.json()) as { id: string };
  return getDriveFile(accessToken, file.id);
}
