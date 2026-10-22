import type { Db } from "@/lib/db/client";
import type { TagRecord } from "@/types";

/** Normaliza tags: minusculas, sem espacos duplicados, tamanho maximo 48. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 48);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out.slice(0, 40);
}

export async function listFileTags(db: Db, userId: string, fileId: string): Promise<TagRecord[]> {
  return db.query<TagRecord>(
    `select t.id, t.name, t.created_at
       from public.file_tags ft
       join public.tags t on t.id = ft.tag_id
      where ft.file_id = $1 and t.user_id = $2
      order by t.name asc`,
    [fileId, userId],
  );
}

export async function listAllTags(db: Db, userId: string): Promise<TagRecord[]> {
  return db.query<TagRecord>(
    `select t.id, t.name, t.created_at
       from public.tags t
      where t.user_id = $1
      order by t.name asc`,
    [userId],
  );
}

export async function setFileTags(
  db: Db,
  userId: string,
  fileId: string,
  tags: string[],
): Promise<TagRecord[]> {
  const normalized = normalizeTags(tags);

  const owns = await db.query<{ id: string }>(
    `select id from public.files where id = $1 and user_id = $2 limit 1`,
    [fileId, userId],
  );
  if (owns.length === 0) return [];

  for (const name of normalized) {
    await db.query(
      `insert into public.tags (user_id, name) values ($1, $2)
       on conflict (user_id, lower(name)) do update set name = excluded.name`,
      [userId, name],
    );
  }

  await db.query(`delete from public.file_tags where file_id = $1`, [fileId]);
  if (normalized.length > 0) {
    await db.query(
      `insert into public.file_tags (file_id, tag_id)
       select $1, t.id from public.tags t
        where t.user_id = $2 and lower(t.name) = any($3::text[])
       on conflict do nothing`,
      [fileId, userId, normalized],
    );
  }

  return listFileTags(db, userId, fileId);
}
