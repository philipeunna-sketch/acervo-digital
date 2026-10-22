import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDb, readyDb, type Db } from "@/lib/db/client";

/**
 * Runner de migracoes. Aplicado tanto no Postgres gerenciado (Supabase/Neon)
 * quanto no PGlite local. As migracoes ficam em `supabase/migrations/*.sql`.
 */

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export interface MigrationFile {
  id: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  id: string;
  checksum: string;
  applied_at: string;
}

export async function loadMigrationFiles(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const files: MigrationFile[] = [];
  for (const id of entries) {
    const sql = await readFile(path.join(dir, id), "utf8");
    files.push({ id, sql, checksum: createHash("sha256").update(sql).digest("hex").slice(0, 32) });
  }
  return files;
}

export async function listApplied(db: Db): Promise<AppliedMigration[]> {
  await db.exec(`
    create table if not exists public._migrations (
      id text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
  return db.query<AppliedMigration>(
    "select id, checksum, applied_at::text as applied_at from public._migrations order by id",
  );
}

export async function runMigrations(options?: { dir?: string }): Promise<{ applied: string[]; skipped: string[] }> {
  const db = await readyDb();
  const files = await loadMigrationFiles(options?.dir);
  const appliedRows = await listApplied(db);
  const appliedMap = new Map(appliedRows.map((row) => [row.id, row.checksum]));
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const existing = appliedMap.get(file.id);
    if (existing) {
      if (existing !== file.checksum) {
        console.warn(
          `[migrate] AVISO: ${file.id} ja foi aplicada com checksum diferente (${existing} != ${file.checksum}).`,
        );
      }
      skipped.push(file.id);
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.exec(file.sql);
      await tx.query("insert into public._migrations (id, checksum) values ($1, $2)", [file.id, file.checksum]);
    });
    applied.push(file.id);
    console.log(`[migrate] aplicada: ${file.id}`);
  }

  return { applied, skipped };
}

let ensurePromise: Promise<void> | null = null;

/**
 * Garante que o schema esteja pronto. Em desenvolvimento roda automaticamente;
 * em producao depende de `AUTO_MIGRATE=true` ou da execucao manual de
 * `npm run migrate`.
 */
export function ensureSchema(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const shouldRun =
        process.env.AUTO_MIGRATE === "true" ||
        process.env.NODE_ENV !== "production" ||
        process.env.VERCEL_ENV === "preview";
      if (!shouldRun) return;
      try {
        await runMigrations();
      } catch (error) {
        console.error("[db] falha ao aplicar migracoes:", error);
        throw error;
      }
    })();
  }
  return ensurePromise;
}

export async function migrationStatus(): Promise<{
  applied: AppliedMigration[];
  pending: MigrationFile[];
}> {
  const db = await readyDb();
  const appliedRows = await listApplied(db);
  const files = await loadMigrationFiles();
  const appliedIds = new Set(appliedRows.map((r) => r.id));
  return {
    applied: appliedRows,
    pending: files.filter((f) => !appliedIds.has(f.id)),
  };
}

export { getDb };
