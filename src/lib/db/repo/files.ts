import type { Db } from "@/lib/db/client";
import type { FileRecord, Paginated } from "@/types";

/**
 * Repositorio de arquivos. Todas as consultas escopam por `user_id`, mesmo
 * quando o RLS esta ativo (defesa em profundidade contra falhas de policy).
 */

export interface FileListQuery {
  q?: string;
  category?: FileRecord["category"];
  providerId?: string;
  albumId?: string;
  from?: string;
  to?: string;
  minSize?: number;
  maxSize?: number;
  favorite?: boolean;
  processed?: "all" | "yes" | "no";
  status?: "active" | "trashed";
  extension?: string;
  sort?: "recent" | "oldest" | "name_asc" | "name_desc" | "size_desc" | "size_asc" | "type" | "provider";
  page?: number;
  pageSize?: number;
}

const SORT_SQL: Record<NonNullable<FileListQuery["sort"]>, string> = {
  recent: "f.created_at desc, f.id desc",
  oldest: "f.created_at asc, f.id asc",
  name_asc: "lower(f.name) asc, f.id asc",
  name_desc: "lower(f.name) desc, f.id desc",
  size_desc: "f.size_bytes desc, f.id desc",
  size_asc: "f.size_bytes asc, f.id asc",
  type: "f.category asc, lower(coalesce(f.extension, '')) asc, lower(f.name) asc",
  provider: "f.provider_kind asc, coalesce(f.provider_id::text, '') asc, lower(f.name) asc",
};

/**
 * Colunas do arquivo para leituras (inclui o indicador de favorito).
 * O predicado de favorito e calculado na consulta para evitar N+1.
 */
export const FILE_COLUMNS = `
  f.id, f.user_id, f.name, f.original_name, f.extension, f.mime_type, f.size_bytes, f.category,
  f.provider_id, f.provider_kind, f.storage_key, f.external_id, f.external_url, f.checksum, f.status,
  f.source, f.source_url, f.source_meta, f.media_meta, f.text_extracted, f.excerpt, f.description,
  f.trashed_at, f.created_at, f.updated_at,
  exists (select 1 from public.favorites fav where fav.file_id = f.id and fav.user_id = f.user_id) as is_favorite
`;

/** Colunas retornadas por INSERT/UPDATE/DELETE (sem alias de tabela). */
export const FILE_RETURNING_COLUMNS = `
  id, user_id, name, original_name, extension, mime_type, size_bytes, category,
  provider_id, provider_kind, storage_key, external_id, external_url, checksum, status,
  source, source_url, source_meta, media_meta, text_extracted, excerpt, description,
  trashed_at, created_at, updated_at, false as is_favorite
`;

function buildFilters(query: FileListQuery, userId: string): { where: string; params: unknown[] } {
  const clauses: string[] = ["f.user_id = $1"];
  const params: unknown[] = [userId];

  /**
   * Adiciona uma clausula. Use `{0}`, `{1}`... para reservar posicoes de
   * parametro; os valores sao numerados automaticamente.
   */
  const add = (template: string, ...values: unknown[]): void => {
    const placeholders: string[] = [];
    for (const value of values) {
      params.push(value);
      placeholders.push(`$${params.length}`);
    }
    clauses.push(template.replace(/\{(\d+)\}/g, (_match, index: string) => placeholders[Number(index)] ?? "$1"));
  };

  add("f.status = {0}", query.status ?? "active");

  if (query.category) add("f.category = {0}", query.category);
  if (query.providerId) add("f.provider_id = {0}", query.providerId);
  if (query.extension) add("lower(coalesce(f.extension, '')) = {0}", query.extension.toLowerCase());
  if (query.minSize !== undefined) add("f.size_bytes >= {0}", query.minSize);
  if (query.maxSize !== undefined) add("f.size_bytes <= {0}", query.maxSize);
  if (query.from) add("f.created_at >= {0}::date", query.from);
  if (query.to) add("f.created_at < ({0}::date + interval '1 day')", query.to);
  if (query.processed === "yes") add("f.text_extracted = true");
  if (query.processed === "no") add("f.text_extracted = false");

  if (query.albumId) {
    add(`exists (select 1 from public.album_files af where af.file_id = f.id and af.album_id = {0})`, query.albumId);
  }

  if (query.favorite) {
    add(`exists (select 1 from public.favorites fav where fav.file_id = f.id and fav.user_id = {0})`, userId);
  }

  if (query.q) {
    const like = `%${query.q}%`;
    add(
      `(f.name ilike {0}
        or coalesce(f.description, '') ilike {0}
        or coalesce(f.excerpt, '') ilike {0}
        or exists (
          select 1 from public.file_tags ft
          join public.tags t on t.id = ft.tag_id
          where ft.file_id = f.id and t.name ilike {0}
        ))`,
      like,
    );
  }

  return { where: clauses.join(" and "), params };
}

export async function listFiles(
  db: Db,
  userId: string,
  query: FileListQuery = {},
): Promise<Paginated<FileRecord>> {
  const { where, params } = buildFilters(query, userId);
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 24));
  const offset = (page - 1) * pageSize;
  const order = SORT_SQL[query.sort ?? "recent"];

  const countRows = await db.query<{ count: number }>(
    `select count(*)::int as count from public.files f where ${where}`,
    params,
  );
  const total = countRows[0]?.count ?? 0;

  const rows = await db.query<FileRecord>(
    `select ${FILE_COLUMNS}
       from public.files f
      where ${where}
      order by ${order}
      limit ${pageSize} offset ${offset}`,
    params,
  );

  return { items: rows, total, page, pageSize, hasMore: offset + rows.length < total };
}

export async function getFile(db: Db, userId: string, fileId: string): Promise<FileRecord | null> {
  const rows = await db.query<FileRecord>(
    `select ${FILE_COLUMNS} from public.files f where f.id = $1 and f.user_id = $2 limit 1`,
    [fileId, userId],
  );
  return rows[0] ?? null;
}

export async function getFiles(db: Db, userId: string, fileIds: string[]): Promise<FileRecord[]> {
  if (fileIds.length === 0) return [];
  const rows = await db.query<FileRecord>(
    `select ${FILE_COLUMNS} from public.files f where f.user_id = $1 and f.id = any($2::uuid[])`,
    [userId, fileIds],
  );
  return rows;
}

export interface InsertFileInput {
  userId: string;
  name: string;
  originalName: string;
  extension: string | null;
  mimeType: string;
  sizeBytes: number;
  category: FileRecord["category"];
  providerId: string | null;
  providerKind: FileRecord["provider_kind"];
  storageKey: string;
  externalId?: string | null;
  externalUrl?: string | null;
  checksum?: string | null;
  source?: FileRecord["source"];
  sourceUrl?: string | null;
  sourceMeta?: Record<string, unknown>;
  mediaMeta?: Record<string, unknown>;
  description?: string | null;
  excerpt?: string | null;
  textExtracted?: boolean;
}

export async function insertFile(db: Db, input: InsertFileInput): Promise<FileRecord> {
  const rows = await db.query<FileRecord>(
    `insert into public.files (
        user_id, name, original_name, extension, mime_type, size_bytes, category,
        provider_id, provider_kind, storage_key, external_id, external_url, checksum,
        source, source_url, source_meta, media_meta, description, excerpt, text_extracted, status
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'active')
     returning ${FILE_RETURNING_COLUMNS}`,
    [
      input.userId,
      input.name,
      input.originalName,
      input.extension,
      input.mimeType,
      input.sizeBytes,
      input.category,
      input.providerId,
      input.providerKind,
      input.storageKey,
      input.externalId ?? null,
      input.externalUrl ?? null,
      input.checksum ?? null,
      input.source ?? "upload",
      input.sourceUrl ?? null,
      JSON.stringify(input.sourceMeta ?? {}),
      JSON.stringify(input.mediaMeta ?? {}),
      input.description ?? null,
      input.excerpt ?? null,
      input.textExtracted ?? false,
    ],
  );
  return rows[0]!;
}

export async function updateFile(
  db: Db,
  userId: string,
  fileId: string,
  patch: {
    name?: string;
    description?: string | null;
    mediaMeta?: Record<string, unknown>;
    sourceMeta?: Record<string, unknown>;
    excerpt?: string | null;
    textExtracted?: boolean;
    sizeBytes?: number;
    mimeType?: string;
  },
): Promise<FileRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown): void => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.name !== undefined) push("name", patch.name);
  if (patch.description !== undefined) push("description", patch.description);
  if (patch.mediaMeta !== undefined) push("media_meta", JSON.stringify(patch.mediaMeta));
  if (patch.sourceMeta !== undefined) push("source_meta", JSON.stringify(patch.sourceMeta));
  if (patch.excerpt !== undefined) push("excerpt", patch.excerpt);
  if (patch.textExtracted !== undefined) push("text_extracted", patch.textExtracted);
  if (patch.sizeBytes !== undefined) push("size_bytes", patch.sizeBytes);
  if (patch.mimeType !== undefined) push("mime_type", patch.mimeType);

  if (sets.length === 0) return getFile(db, userId, fileId);

  params.push(fileId, userId);
  const rows = await db.query<FileRecord>(
    `update public.files set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length - 1} and user_id = $${params.length}
      returning ${FILE_RETURNING_COLUMNS}`,
    params,
  );
  return rows[0] ?? null;
}

export async function moveToTrash(db: Db, userId: string, fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await db.query<{ id: string }>(
    `update public.files set status = 'trashed', trashed_at = now(), updated_at = now()
      where id = any($1::uuid[]) and user_id = $2 and status <> 'trashed'
      returning id`,
    [fileIds, userId],
  );
  return rows.length;
}

export async function restoreFromTrash(db: Db, userId: string, fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await db.query<{ id: string }>(
    `update public.files set status = 'active', trashed_at = null, updated_at = now()
      where id = any($1::uuid[]) and user_id = $2 and status = 'trashed'
      returning id`,
    [fileIds, userId],
  );
  return rows.length;
}

export async function deletePermanently(db: Db, userId: string, fileIds: string[]): Promise<FileRecord[]> {
  if (fileIds.length === 0) return [];
  return db.query<FileRecord>(
    `delete from public.files where id = any($1::uuid[]) and user_id = $2 returning ${FILE_RETURNING_COLUMNS}`,
    [fileIds, userId],
  );
}

export async function setFavorite(
  db: Db,
  userId: string,
  fileId: string,
  favorite: boolean,
): Promise<boolean> {
  if (favorite) {
    await db.query(
      `insert into public.favorites (user_id, file_id) values ($1, $2)
       on conflict do nothing`,
      [userId, fileId],
    );
  } else {
    await db.query(`delete from public.favorites where user_id = $1 and file_id = $2`, [userId, fileId]);
  }
  return favorite;
}

export async function listFavorites(db: Db, userId: string): Promise<FileRecord[]> {
  return db.query<FileRecord>(
    `select ${FILE_COLUMNS}
       from public.files f
       join public.favorites fav on fav.file_id = f.id and fav.user_id = f.user_id
      where f.user_id = $1 and f.status = 'active'
      order by fav.created_at desc`,
    [userId],
  );
}

export async function getAlbumIdsForFile(db: Db, userId: string, fileId: string): Promise<string[]> {
  const rows = await db.query<{ album_id: string }>(
    `select af.album_id from public.album_files af
       join public.albums a on a.id = af.album_id
      where af.file_id = $1 and a.user_id = $2`,
    [fileId, userId],
  );
  return rows.map((r) => r.album_id);
}

export async function setFileAlbums(
  db: Db,
  userId: string,
  fileId: string,
  albumIds: string[],
): Promise<void> {
  const valid = albumIds.length
    ? (
        await db.query<{ id: string }>(
          `select id from public.albums where id = any($1::uuid[]) and user_id = $2`,
          [albumIds, userId],
        )
      ).map((r) => r.id)
    : [];

  await db.query(`delete from public.album_files where file_id = $1`, [fileId]);
  for (const albumId of valid) {
    await db.query(
      `insert into public.album_files (album_id, file_id) values ($1, $2) on conflict do nothing`,
      [albumId, fileId],
    );
  }
}

export async function searchFiles(db: Db, userId: string, term: string, limit = 12): Promise<FileRecord[]> {
  const like = `%${term}%`;
  return db.query<FileRecord>(
    `select ${FILE_COLUMNS}
       from public.files f
      where f.user_id = $1 and f.status = 'active'
        and (f.name ilike $2 or coalesce(f.description, '') ilike $2 or coalesce(f.excerpt, '') ilike $2)
      order by f.created_at desc
      limit ${limit}`,
    [userId, like],
  );
}
