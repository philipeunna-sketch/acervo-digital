import { NextResponse } from "next/server";
import { getEnv, isAuthSupabase, isStorageS3 } from "@/lib/env";
import { readyDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check da aplicacao. Nao expoe segredos: apenas o estado dos
 * componentes (banco, autenticacao, storage).
 */
export async function GET(): Promise<NextResponse> {
  const env = getEnv();
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    await readyDb();
    checks.database = { ok: true, detail: env.DATABASE_URL ? "Postgres gerenciado" : "PGlite local" };
  } catch (error) {
    checks.database = { ok: false, detail: error instanceof Error ? error.message : "falha" };
  }

  checks.storage = {
    ok: true,
    detail: isStorageS3() ? "S3/Wasabi configurado" : "Driver local (desenvolvimento)",
  };
  checks.auth = {
    ok: true,
    detail: isAuthSupabase() ? "Supabase Auth" : "Driver local de autenticacao",
  };

  const ok = Object.values(checks).every((check) => check.ok);
  return NextResponse.json({ status: ok ? "ok" : "degraded", checks }, { status: ok ? 200 : 503 });
}
