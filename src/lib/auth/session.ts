import { isAuthSupabase } from "@/lib/env";
import { LocalAuthAdapter } from "@/lib/auth/local";
import { SupabaseAuthAdapter } from "@/lib/auth/supabase";
import type { AuthAdapter, AuthUser } from "@/lib/auth/types";

/**
 * Fachada de autenticacao. Escolhe o driver conforme o ambiente:
 *  - `supabase` (producao) quando as credenciais do Supabase existem;
 *  - `local` (desenvolvimento) caso contrario.
 */

let adapter: AuthAdapter | null = null;

export function getAuthAdapter(): AuthAdapter {
  if (adapter) return adapter;
  adapter = isAuthSupabase() ? new SupabaseAuthAdapter() : new LocalAuthAdapter();
  return adapter;
}

export function resetAuthAdapter(): void {
  adapter = null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    return await getAuthAdapter().getUser();
  } catch (error) {
    console.error("[auth] falha ao obter a sessao:", error instanceof Error ? error.message : error);
    return null;
  }
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Nao autenticado.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Exige um usuario autenticado; lanca `UnauthorizedError` caso contrario. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    const error = new Error("Permissao insuficiente.");
    (error as Error & { status: number }).status = 403;
    throw error;
  }
  return user;
}
