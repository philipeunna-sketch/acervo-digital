import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";
import { readyDb } from "@/lib/db/client";
import type { AuthAdapter, AuthResult, AuthUser, PasswordResetRequest } from "@/lib/auth/types";

/**
 * Driver de autenticacao Supabase (producao).
 *
 * A sessao fica em cookies httpOnly gerenciados pelo `@supabase/ssr`; o
 * service role e usado exclusivamente no servidor (criacao do admin).
 */

function publicConfig(): { url: string; anonKey: string } {
  const env = getEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY sao obrigatorios para o driver Supabase.");
  }
  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const { url, anonKey } = publicConfig();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Em Server Components a escrita de cookies pode falhar; o
          // middleware do Next refaz o refresh da sessao.
        }
      },
    },
  });
}

function serviceClient() {
  const env = getEnv();
  const { url } = publicConfig();
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente (necessario para operacoes administrativas).");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface ProfileRow {
  id: string;
  email: string;
  role: "admin" | "user";
  must_change_password: boolean;
  full_name: string | null;
  avatar_url: string | null;
}

async function loadProfile(userId: string, email: string): Promise<ProfileRow> {
  const db = await readyDb();
  const rows = await db.query<ProfileRow>(
    `select id, email, role, must_change_password, full_name, avatar_url
       from public.profiles where id = $1 limit 1`,
    [userId],
  );
  const existing = rows[0];
  if (existing) return existing;

  const inserted = await db.query<ProfileRow>(
    `insert into public.profiles (id, email, role, must_change_password)
     values ($1, $2, 'user', false)
     on conflict (id) do update set email = excluded.email
     returning id, email, role, must_change_password, full_name, avatar_url`,
    [userId, email],
  );
  return inserted[0]!;
}

function mapError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "E-mail ou senha invalidos.";
  if (lower.includes("email not confirmed")) return "E-mail nao confirmado. Verifique sua caixa de entrada.";
  if (lower.includes("user already registered")) return "Ja existe uma conta com este e-mail.";
  if (lower.includes("should be at least")) return "A senha deve ter ao menos 6 caracteres.";
  if (lower.includes("rate limit") || lower.includes("too many")) return "Muitas tentativas. Aguarde alguns instantes.";
  return message;
}

export class SupabaseAuthAdapter implements AuthAdapter {
  readonly name = "supabase" as const;

  isConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return { ok: false, error: mapError(error?.message ?? "Falha ao autenticar."), code: "invalid_credentials" };
    }
    const profile = await loadProfile(data.user.id, data.user.email ?? email);
    return {
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
        role: profile.role,
        mustChangePassword: profile.must_change_password,
        fullName: profile.full_name,
        avatarUrl: profile.avatar_url,
      },
    };
  }

  async signOut(): Promise<void> {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  async getUser(): Promise<AuthUser | null> {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const profile = await loadProfile(data.user.id, data.user.email ?? "");
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      role: profile.role,
      mustChangePassword: profile.must_change_password,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
    };
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
    const supabase = await createSupabaseServerClient();
    const { data: session } = await supabase.auth.getUser();
    if (!session.user) return { ok: false, error: "Sessao expirada. Entre novamente." };

    const check = await supabase.auth.signInWithPassword({
      email: session.user.email ?? "",
      password: currentPassword,
    });
    if (check.error) {
      return { ok: false, error: "Senha atual incorreta.", code: "invalid_credentials" };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: mapError(error.message) };

    const db = await readyDb();
    await db.query(
      `update public.profiles set must_change_password = false, updated_at = now() where id = $1`,
      [session.user.id],
    );

    const profile = await loadProfile(session.user.id, session.user.email ?? "");
    return {
      ok: true,
      user: {
        id: session.user.id,
        email: session.user.email ?? "",
        role: profile.role,
        mustChangePassword: false,
        fullName: profile.full_name,
        avatarUrl: profile.avatar_url,
      },
    };
  }

  async requestPasswordReset(email: string): Promise<PasswordResetRequest> {
    const supabase = await createSupabaseServerClient();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
    const redirectTo = base ? `${base.replace(/\/$/, "")}/auth/callback?next=/reset-password` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) return { ok: false, message: mapError(error.message) };
    return { ok: true, message: "Se o e-mail existir, enviaremos as instrucoes de redefinicao." };
  }

  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "recovery" });
    if (error) return { ok: false, error: mapError(error.message) };
    const update = await supabase.auth.updateUser({ password: newPassword });
    if (update.error) return { ok: false, error: mapError(update.error.message) };
    return { ok: true, user: { id: "", email: "", role: "user", mustChangePassword: false, fullName: null, avatarUrl: null } };
  }

  async createAdminUser(email: string, password: string): Promise<AuthResult> {
    const admin = serviceClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "admin" },
    });
    if (error || !data.user) {
      return { ok: false, error: mapError(error?.message ?? "Falha ao criar usuario.") };
    }
    const db = await readyDb();
    await db.query(
      `insert into public.profiles (id, email, role, must_change_password)
       values ($1, $2, 'admin', true)
       on conflict (id) do update set role = 'admin'`,
      [data.user.id, email],
    );
    return {
      ok: true,
      user: { id: data.user.id, email, role: "admin", mustChangePassword: true, fullName: null, avatarUrl: null },
    };
  }
}
