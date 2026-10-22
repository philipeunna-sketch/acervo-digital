import type { Db } from "@/lib/db/client";
import type { AlbumRecord, FileRecord } from "@/types";
import { FILE_COLUMNS } from "@/lib/db/repo/files";

export async function listAlbums(db: Db, userId: string): Promise<AlbumRecord[]> {
  return db.query<AlbumRecord>(
    `select a.id, a.user_id, a.name, a.description, a.cover_file_id, a.created_at, a.updated_at,
            (select count(*) from public.album_files af join public.files f on f.id = af.file_id
              where af.album_id = a.id and f.status = 'active')::int as file_count
       from public.albums a
      where a.user_id = $1
      order by a.created_at desc`,
    [userId],
  );
}

export async function getAlbum(db: Db, userId: string, albumId: string): Promise<AlbumRecord | null> {
  const rows = await db.query<AlbumRecord>(
    `select a.id, a.user_id, a.name, a.description, a.cover_file_id, a.created_at, a.updated_at,
            (select count(*) from public.album_files af join public.files f on f.id = af.file_id
              where af.album_id = a.id and f.status = 'active')::int as file_count
       from public.albums a
      where a.id = $1 and a.user_id = $2
      limit 1`,
    [albumId, userId],
  );
  return rows[0] ?? null;
}

export async function createAlbum(
  db: Db,
  userId: string,
  input: { name: string; description?: string | null; coverFileId?: string | null },
): Promise<AlbumRecord> {
  const rows = await db.query<AlbumRecord>(
    `insert into public.albums (user_id, name, description, cover_file_id)
     values ($1, $2, $3, $4)
     returning id, user_id, name, description, cover_file_id, created_at, updated_at, 0::int as file_count`,
    [userId, input.name, input.description ?? null, input.coverFileId ?? null],
  );
  return rows[0]!;
}

export async function updateAlbum(
  db: Db,
  userId: string,
  albumId: string,
  patch: { name?: string; description?: string | null; coverFileId?: string | null },
): Promise<AlbumRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown): void => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (patch.name !== undefined) push("name", patch.name);
  if (patch.description !== undefined) push("description", patch.description);
  if (patch.coverFileId !== undefined) push("cover_file_id", patch.coverFileId);

  if (sets.length === 0) return getAlbum(db, userId, albumId);

  params.push(albumId, userId);
  const rows = await db.query<AlbumRecord>(
    `update public.albums set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length - 1} and user_id = $${params.length}
      returning id, user_id, name, description, cover_file_id, created_at, updated_at,
                (select count(*) from public.album_files af where af.album_id = public.albums.id)::int as file_count`,
    params,
  );
  return rows[0] ?? null;
}

export async function deleteAlbum(db: Db, userId: string, albumId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.albums where id = $1 and user_id = $2 returning id`,
    [albumId, userId],
  );
  return rows.length > 0;
}

export async function albumFiles(
  db: Db,
  userId: string,
  albumId: string,
  options?: { page?: number; pageSize?: number; sort?: string },
): Promise<{ items: FileRecord[]; total: number }> {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 48));
  const offset = (page - 1) * pageSize;

  const countRows = await db.query<{ count: number }>(
    `select count(*)::int as count
       from public.album_files af
       join public.files f on f.id = af.file_id
      where af.album_id = $1 and f.user_id = $2 and f.status = 'active'`,
    [albumId, userId],
  );

  const rows = await db.query<FileRecord>(
    `select ${FILE_COLUMNS}
       from public.album_files af
       join public.files f on f.id = af.file_id
      where af.album_id = $1 and f.user_id = $2 and f.status = 'active'
      order by af.created_at desc
      limit ${pageSize} offset ${offset}`,
    [albumId, userId],
  );

  return { items: rows, total: countRows[0]?.count ?? 0 };
}

export async function addFilesToAlbum(
  db: Db,
  userId: string,
  albumId: string,
  fileIds: string[],
): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await db.query<{ file_id: string }>(
    `insert into public.album_files (album_id, file_id)
     select $1, f.id from public.files f
      where f.id = any($2::uuid[]) and f.user_id = $3
     on conflict do nothing
     returning file_id`,
    [albumId, fileIds, userId],
  );
  return rows.length;
}

export async function removeFilesFromAlbum(
  db: Db,
  userId: string,
  albumId: string,
  fileIds: string[],
): Promise<number> {
  if (fileIds.length === 0) return 0;
  const rows = await db.query<{ file_id: string }>(
    `delete from public.album_files af
      where af.album_id = $1 and af.file_id = any($2::uuid[])
        and exists (select 1 from public.albums a where a.id = af.album_id and a.user_id = $3)
      returning file_id`,
    [albumId, fileIds, userId],
  );
  return rows.length;
}
