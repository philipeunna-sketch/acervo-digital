import type { Db } from "@/lib/db/client";
import type { DashboardStats, FileCategory, FileRecord } from "@/types";
import { FILE_COLUMNS } from "@/lib/db/repo/files";
import { countUploadSessions } from "@/lib/db/repo/uploads";

export async function dashboardStats(db: Db, userId: string): Promise<DashboardStats> {
  const [totals] = await db.query<{
    files: number;
    bytes: number;
    documents: number;
    images: number;
    videos: number;
    audio: number;
    other: number;
    albums: number;
    favorites: number;
    trashed: number;
  }>(
    `select
       count(*) filter (where status = 'active')::int as files,
       coalesce(sum(size_bytes) filter (where status = 'active'), 0)::bigint as bytes,
       count(*) filter (where status = 'active' and category = 'document')::int as documents,
       count(*) filter (where status = 'active' and category = 'image')::int as images,
       count(*) filter (where status = 'active' and category = 'video')::int as videos,
       count(*) filter (where status = 'active' and category = 'audio')::int as audio,
       count(*) filter (where status = 'active' and category not in ('document','image','video','audio'))::int as other,
       (select count(*) from public.albums where user_id = $1)::int as albums,
       (select count(*) from public.favorites where user_id = $1)::int as favorites,
       count(*) filter (where status = 'trashed')::int as trashed
     from public.files
     where user_id = $1`,
    [userId],
  );

  const byType = await db.query<{ category: FileCategory; count: number; bytes: number }>(
    `select category, count(*)::int as count, coalesce(sum(size_bytes), 0)::bigint as bytes
       from public.files
      where user_id = $1 and status = 'active'
      group by category
      order by bytes desc`,
    [userId],
  );

  const byProvider = await db.query<{
    provider_id: string | null;
    provider_kind: string;
    label: string;
    count: number;
    bytes: number;
  }>(
    `select f.provider_id, f.provider_kind,
            coalesce(sp.name, f.provider_kind) as label,
            count(*)::int as count,
            coalesce(sum(f.size_bytes), 0)::bigint as bytes
       from public.files f
       left join public.storage_providers sp on sp.id = f.provider_id
      where f.user_id = $1 and f.status = 'active'
      group by f.provider_id, f.provider_kind, sp.name
      order by bytes desc`,
    [userId],
  );

  const uploads = await countUploadSessions(db, userId);

  const recentFiles = await db.query<FileRecord>(
    `select ${FILE_COLUMNS} from public.files f
      where f.user_id = $1 and f.status = 'active'
      order by f.created_at desc limit 8`,
    [userId],
  );

  const largestFiles = await db.query<FileRecord>(
    `select ${FILE_COLUMNS} from public.files f
      where f.user_id = $1 and f.status = 'active'
      order by f.size_bytes desc limit 5`,
    [userId],
  );

  const provider = await db.query<{ name: string; kind: string }>(
    `select name, kind from public.storage_providers
      where is_active = true and (user_id = $1 or is_system = true)
      order by is_default desc, is_system desc limit 1`,
    [userId],
  );

  const usage = await db.query<{ used_bytes: number; total_bytes: number | null }>(
    `select coalesce(sum(size_bytes) filter (where status = 'active'), 0)::bigint as used_bytes,
            null::bigint as total_bytes
       from public.files where user_id = $1`,
    [userId],
  );

  return {
    totals: {
      files: totals?.files ?? 0,
      bytes: Number(totals?.bytes ?? 0),
      documents: totals?.documents ?? 0,
      images: totals?.images ?? 0,
      videos: totals?.videos ?? 0,
      audio: totals?.audio ?? 0,
      other: totals?.other ?? 0,
      albums: totals?.albums ?? 0,
      favorites: totals?.favorites ?? 0,
      trashed: totals?.trashed ?? 0,
    },
    uploads,
    storage: {
      usedBytes: Number(usage[0]?.used_bytes ?? totals?.bytes ?? 0),
      totalBytes: usage[0]?.total_bytes ?? null,
      providerName: provider[0]?.name ?? "Armazenamento local (dev)",
      providerKind: (provider[0]?.kind as "s3" | "local") ?? "local",
    },
    byType,
    byProvider: byProvider.map((row) => ({
      providerId: row.provider_id,
      providerKind: row.provider_kind as "s3" | "local",
      label: row.label,
      count: row.count,
      bytes: Number(row.bytes),
    })),
    recentFiles,
    largestFiles,
  };
}
