import { cookies } from "next/headers";
import { getSessionSecret } from "@/lib/env";
import { hashPassword, randomToken, sha256, signPayload, verifyPassword, verifySignedPayload } from "@/lib/security/crypto";
import { readyDb } from "@/lib/db/client";
import type { AuthAdapter, AuthResult, AuthUser, PasswordResetRequest } from "@/lib/auth/types";

/**
 * Driver de autenticacao local (desenvolvimento / demonstracao).
 *
 * Guarda o hash da senha (scrypt) e a sessao apenas no servidor; o navegador
 * recebe um cookie httpOnly assinado. Nao substitui o Supabase Auth em
 * producao - use `AUTH_DRIVER=supabase`.
 */

const SESSION_COOKIE = "acervo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

interface LocalUserRow {
  id: string;
  email: string;
  password_hash: string;
  role: "admin" | "user";
  must_change_password: boolean;
  full_name: string | null;
}

export class LocalAuthAdapter implements AuthAdapter {
  readonly name = "local" as const;

  isConfigured(): boolean {
    return true;
  }

  private async findUser(email: string): Promise<LocalUserRow | null> {
    const db = await readyDb();
    const rows = await db.query<LocalUserRow>(
      `select lu.id, lu.email, lu.password_hash, lu.role, lu.must_change_password,
              p.full_name
         from public.local_users lu
         left join public.profiles p on p.id = lu.id
        where lower(lu.email) = lower($1)
        limit 1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const user = await this.findUser(email);
    if (!user) {
      // Tempo constante para nao revelar se o e-mail existe.
      await verifyPassword(password, "scrypt$16384$8$1$AAAA$AAAA");
      return { ok: false, error: "E-mail ou senha invalidos.", code: "invalid_credentials" };
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return { ok: false, error: "E-mail ou senha invalidos.", code: "invalid_credentials" };
    }

    const db = await readyDb();
    const sessionId = randomToken(24);
    const tokenHash = sha256(sessionId);
    await db.query(
      `insert into public.local_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '7 days')`,
      [user.id, tokenHash],
    );
    await db.query(`update public.local_users set last_login_at = now() where id = $1`, [user.id]);
    await this.writeSessionCookie(sessionId);

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.must_change_password,
        fullName: user.full_name,
        avatarUrl: null,
      },
    };
  }

  async signOut(): Promise<void> {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE)?.value;
    if (raw) {
      const payload = verifySignedPayload(raw, getSessionSecret());
      if (payload) {
        const db = await readyDb();
        await db.query(`delete from public.local_sessions where token_hash = $1`, [sha256(payload)]);
      }
    }
    store.delete(SESSION_COOKIE);
  }

  async getUser(): Promise<AuthUser | null> {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE)?.value;
    if (!raw) return null;

    const sessionId = verifySignedPayload(raw, getSessionSecret());
    if (!sessionId) return null;

    const db = await readyDb();
    const rows = await db.query<LocalUserRow & { expires_at: string }>(
      `select lu.id, lu.email, lu.password_hash, lu.role, lu.must_change_password, p.full_name, s.expires_at
         from public.local_sessions s
         join public.local_users lu on lu.id = s.user_id
         left join public.profiles p on p.id = lu.id
        where s.token_hash = $1`,
      [sha256(sessionId)],
    );
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await db.query(`delete from public.local_sessions where token_hash = $1`, [sha256(sessionId)]);
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      mustChangePassword: row.must_change_password,
      fullName: row.full_name,
      avatarUrl: null,
    };
  }

  async updatePassword(currentPassword: string, newPassword: string): Promise<AuthResult> {
    const user = await this.getUser();
    if (!user) return { ok: false, error: "Sessao expirada. Entre novamente." };
    const db = await readyDb();
    const rows = await db.query<LocalUserRow>(
      `select id, email, password_hash, role, must_change_password, null as full_name
         from public.local_users where id = $1`,
      [user.id],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: "Usuario nao encontrado." };

    const valid = await verifyPassword(currentPassword, row.password_hash);
    if (!valid) return { ok: false, error: "Senha atual incorreta.", code: "invalid_credentials" };

    const hash = await hashPassword(newPassword);
    await db.query(
      `update public.local_users set password_hash = $1, must_change_password = false, updated_at = now() where id = $2`,
      [hash, user.id],
    );
    await db.query(
      `update public.profiles set must_change_password = false, updated_at = now() where id = $1`,
      [user.id],
    );
    // Encerra as demais sessoes por seguranca.
    await db.query(`delete from public.local_sessions where user_id = $1`, [user.id]);

    return {
      ok: true,
      user: { ...user, mustChangePassword: false },
    };
  }

  async requestPasswordReset(email: string): Promise<PasswordResetRequest> {
    const user = await this.findUser(email);
    if (!user) {
      return { ok: true, message: "Se o e-mail existir, enviaremos as instrucoes de redefinicao." };
    }
    const db = await readyDb();
    const token = randomToken(32);
    await db.query(
      `insert into public.local_password_resets (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [user.id, sha256(token)],
    );
    return {
      ok: true,
      message: "Se o e-mail existir, enviaremos as instrucoes de redefinicao.",
      devToken: token,
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    const db = await readyDb();
    const rows = await db.query<{ id: string; user_id: string }>(
      `select id, user_id from public.local_password_resets
        where token_hash = $1 and used_at is null and expires_at > now()
        limit 1`,
      [sha256(token)],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: "Link de redefinicao invalido ou expirado." };

    const hash = await hashPassword(newPassword);
    await db.query(
      `update public.local_users set password_hash = $1, must_change_password = false, updated_at = now() where id = $2`,
      [hash, row.user_id],
    );
    await db.query(
      `update public.profiles set must_change_password = false, updated_at = now() where id = $1`,
      [row.user_id],
    );
    await db.query(`update public.local_password_resets set used_at = now() where id = $1`, [row.id]);
    await db.query(`delete from public.local_sessions where user_id = $1`, [row.user_id]);

    return { ok: true, user: { id: row.user_id, email: "", role: "user", mustChangePassword: false, fullName: null, avatarUrl: null } };
  }

  async createAdminUser(email: string, password: string): Promise<AuthResult> {
    const db = await readyDb();
    const existing = await db.query<{ id: string }>(
      `select id from public.local_users where lower(email) = lower($1) limit 1`,
      [email],
    );
    if (existing[0]) {
      return { ok: false, error: "Ja existe uma conta com este e-mail.", code: "not_found" };
    }
    const hash = await hashPassword(password);
    const rows = await db.query<{ id: string }>(
      `insert into public.local_users (email, password_hash, role, must_change_password)
       values ($1, $2, 'admin', true) returning id`,
      [email, hash],
    );
    const id = rows[0]!.id;
    await db.query(
      `insert into public.profiles (id, email, role, must_change_password)
       values ($1, $2, 'admin', true)
       on conflict (id) do update set email = excluded.email, role = 'admin', must_change_password = true`,
      [id, email],
    );
    return {
      ok: true,
      user: { id, email, role: "admin", mustChangePassword: true, fullName: null, avatarUrl: null },
    };
  }

  private async writeSessionCookie(sessionId: string): Promise<void> {
    const store = await cookies();
    store.set(SESSION_COOKIE, signPayload(sessionId, getSessionSecret()), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
  }
}

export const LOCAL_SESSION_COOKIE = SESSION_COOKIE;
