import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { listIntegrations } from "@/lib/db/repo/integrations";
import { listProviders } from "@/lib/storage/registry";
import { getEnv } from "@/lib/env";
import { googleDriveConfig, googleDriveEnabled } from "@/lib/integrations/google-drive/client";
import { availableSearchProviders, envSearchProvider } from "@/lib/integrations/search/provider";
import { envAiProvider } from "@/lib/integrations/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado real (configurado/conectado/desconectado) de cada integracao. */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const env = getEnv();

    const payload = await withUser(user.id, async (db) => {
      const integrations = await listIntegrations(db, user.id);
      const providers = await listProviders(db, user.id);
      return { integrations, providers };
    });

    const drive = payload.integrations.find((item) => item.provider === "google_drive");
    const telegram = payload.integrations.find((item) => item.provider === "telegram");
    const ai = payload.integrations.find((item) => item.provider === "ai");
    const search = payload.integrations.find((item) => item.provider === "search");

    const aiProvider = envAiProvider();
    const searchProvider = envSearchProvider();

    return json({
      googleDrive: {
        configured: googleDriveEnabled(),
        connected: drive?.status === "connected",
        status: drive?.status ?? (googleDriveEnabled() ? "disconnected" : "requires_config"),
        accountEmail: drive?.account_email ?? null,
        lastTestedAt: drive?.last_tested_at ?? null,
        lastError: drive?.last_error ?? null,
        scopes: drive?.scopes ?? null,
        redirectUri: googleDriveConfig()?.redirectUri ?? null,
      },
      storage: {
        configured: payload.providers.length > 0,
        status: payload.providers.length > 0 ? "connected" : "requires_config",
        providers: payload.providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          kind: provider.kind,
          endpoint: provider.endpoint,
          region: provider.region,
          bucket: provider.bucket,
          isDefault: provider.is_default,
          lastTestedAt: provider.last_tested_at,
          lastError: provider.last_error,
        })),
      },
      telegram: {
        configured: Boolean(telegram?.status === "connected" || env.TELEGRAM_BOT_TOKEN),
        connected: telegram?.status === "connected",
        status: telegram?.status ?? (env.TELEGRAM_BOT_TOKEN ? "disconnected" : "requires_config"),
        accountLabel: telegram?.account_label ?? null,
        lastTestedAt: telegram?.last_tested_at ?? null,
        lastError: telegram?.last_error ?? null,
      },
      ai: {
        configured: Boolean(aiProvider),
        connected: aiProvider?.isConfigured() ?? false,
        status: aiProvider?.isConfigured() ? "connected" : "requires_config",
        provider: ai?.config?.provider ?? env.AI_PROVIDER ?? "openai",
        model: ai?.config?.model ?? env.AI_MODEL ?? null,
        lastTestedAt: ai?.last_tested_at ?? null,
        lastError: ai?.last_error ?? null,
      },
      search: {
        configured: Boolean(searchProvider?.isConfigured()),
        connected: searchProvider?.isConfigured() ?? false,
        status: searchProvider?.isConfigured() ? "connected" : "requires_config",
        provider: search?.config?.provider ?? env.SEARCH_PROVIDER ?? "brave",
        lastTestedAt: search?.last_tested_at ?? null,
        lastError: search?.last_error ?? null,
        available: availableSearchProviders(),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
