import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";

/**
 * Camada de acesso ao Postgres.
 *
 * A aplicacao fala SQL unico com dois drivers intercambiaveis:
 *  - `postgres`: Postgres gerenciado (Supabase / Neon) via `DATABASE_URL`.
 *  - `pglite`  : Postgres embarcado (WASM) para desenvolvimento local.
 *
 * Como ambos usam a mesma sintaxe (placeholders `$1`), os repositorios e as
 * migracoes sao identicos nos dois ambientes.
 */

export interface Db {
  readonly driver: "postgres" | "pglite";
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /** Executa um script SQL com multiplos statements (protocolo simples). */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface DbState {
  db: Db;
  init: Promise<void>;
}

const globalForDb = globalThis as unknown as { __acervoDb?: DbState };

function pgliteDir(): string {
  return process.env.PGLITE_DIR ?? path.join(process.cwd(), ".dev-data", "pglite");
}

interface PgliteTx {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  exec?(sql: string): Promise<void>;
}

interface PgliteLike {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: PgliteTx) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

interface PostgresTx {
  unsafe<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

interface PostgresLike {
  unsafe<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
  begin<T>(fn: (tx: PostgresTx) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
}

class PgliteDb implements Db {
  readonly driver = "pglite" as const;
  private readonly inner: PgliteLike;

  constructor(inner: PgliteLike) {
    this.inner = inner;
  }

  async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    const result = await this.inner.query<T>(text, params);
    return result.rows;
  }

  async exec(sql: string): Promise<void> {
    await this.inner.exec(sql);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.inner.transaction(async (tx) => {
      const scoped: Db = {
        driver: "pglite",
        query: async <R = Record<string, unknown>>(text: string, params: readonly unknown[] = []) =>
          (await tx.query<R>(text, params)).rows,
        exec: async (sql: string) => {
          if (typeof tx.exec === "function") {
            await tx.exec(sql);
            return;
          }
          await this.inner.exec(sql);
        },
        transaction: async <R>(inner: (t: Db) => Promise<R>) => inner(scoped),
        close: async () => undefined,
      };
      return fn(scoped);
    });
  }

  async close(): Promise<void> {
    await this.inner.close?.();
  }
}

class PostgresDb implements Db {
  readonly driver = "postgres" as const;
  private readonly sql: PostgresLike;

  constructor(sql: PostgresLike) {
    this.sql = sql;
  }

  async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.sql.unsafe<T>(text, params);
  }

  async exec(sql: string): Promise<void> {
    await this.sql.unsafe(sql);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return this.sql.begin(async (tx) => {
      const scoped: Db = {
        driver: "postgres",
        query: async <R = Record<string, unknown>>(text: string, params: readonly unknown[] = []) =>
          tx.unsafe<R>(text, params),
        exec: async (sql: string) => {
          await tx.unsafe(sql);
        },
        transaction: async <R>(inner: (t: Db) => Promise<R>) => inner(scoped),
        close: async () => undefined,
      };
      return fn(scoped);
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

async function createDb(): Promise<Db> {
  const env = getEnv();
  if (env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(env.DATABASE_URL, {
      // `prepare: false` e obrigatorio no pooler transacional do Supabase.
      prepare: false,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idle_timeout: 20,
      connect_timeout: 20,
      onnotice: () => undefined,
    });
    return new PostgresDb(sql as unknown as PostgresLike);
  }

  const dir = pgliteDir();
  await mkdir(dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(dir);
  return new PgliteDb(pg as unknown as PgliteLike);
}

export function getDb(): Db {
  const existing = globalForDb.__acervoDb;
  if (existing) return existing.db;

  const state: DbState = {
    db: undefined as unknown as Db,
    init: Promise.resolve(),
  };
  state.init = createDb()
    .then((db) => {
      state.db = db;
    })
    .catch((error) => {
      globalForDb.__acervoDb = undefined;
      throw error;
    });
  globalForDb.__acervoDb = state;
  return state.db;
}

export async function readyDb(): Promise<Db> {
  if (!globalForDb.__acervoDb) getDb();
  const state = globalForDb.__acervoDb!;
  await state.init;
  return state.db;
}

export async function closeDb(): Promise<void> {
  const state = globalForDb.__acervoDb;
  if (!state) return;
  await state.init.catch(() => undefined);
  await state.db.close().catch(() => undefined);
  globalForDb.__acervoDb = undefined;
}

/**
 * Executa uma operacao no contexto de um usuario autenticado.
 *
 * No driver Postgres define `app.user_id` e (quando disponivel) alterna para
 * o role `authenticated`, de modo que as policies de RLS sejam aplicadas.
 * No driver PGlite o contexto e apenas informativo, mas todos os repositorios
 * filtram explicitamente por `user_id`.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await readyDb();
  const env = getEnv();
  const useRole = db.driver === "postgres" && !env.DISABLE_RLS && (await supportsAuthenticatedRole(db));

  return db.transaction(async (tx) => {
    if (useRole) {
      await tx.query("select set_config('role', 'authenticated', true)");
    }
    await tx.query("select set_config('app.user_id', $1, true)", [userId]);
    return fn(tx);
  });
}

let roleSupport: boolean | null = null;

async function supportsAuthenticatedRole(db: Db): Promise<boolean> {
  if (roleSupport !== null) return roleSupport;
  try {
    const rows = await db.query<{ exists: boolean }>(
      "select exists (select 1 from pg_roles where rolname = 'authenticated') as exists",
    );
    roleSupport = Boolean(rows[0]?.exists);
  } catch {
    roleSupport = false;
  }
  return roleSupport;
}

/** Utilitario para testes: permite resetar caches memoizados. */
export function resetDbCaches(): void {
  roleSupport = null;
}
