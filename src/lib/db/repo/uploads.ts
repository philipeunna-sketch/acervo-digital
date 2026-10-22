import type { Db } from "@/lib/db/client";
import type { UploadSessionRecord } from "@/types";

const UPLOAD_COLUMNS = `
  id, user_id, file_name, size_bytes, mime_type, provider_id, storage_key, multipart_upload_id,
  part_size, status, uploaded_bytes, parts, file_id, error_message, checksum,
  created_at, updated_at, completed_at
`;

export async function createUploadSession(
  db: Db,
  input: {
    userId: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    providerId: string | null;
    storageKey: string;
    multipartUploadId: string | null;
    partSize: number | null;
    status?: UploadSessionRecord["status"];
  },
): Promise<UploadSessionRecord> {
  const rows = await db.query<UploadSessionRecord>(
    `insert into public.upload_sessions (
        user_id, file_name, size_bytes, mime_type, provider_id, storage_key,
        multipart_upload_id, part_size, status
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning ${UPLOAD_COLUMNS}`,
    [
      input.userId,
      input.fileName,
      input.sizeBytes,
      input.mimeType,
      input.providerId,
      input.storageKey,
      input.multipartUploadId,
      input.partSize,
      input.status ?? "preparing",
    ],
  );
  return rows[0]!;
}

export async function getUploadSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<UploadSessionRecord | null> {
  const rows = await db.query<UploadSessionRecord>(
    `select ${UPLOAD_COLUMNS} from public.upload_sessions where id = $1 and user_id = $2 limit 1`,
    [sessionId, userId],
  );
  return rows[0] ?? null;
}

export async function updateUploadSession(
  db: Db,
  userId: string,
  sessionId: string,
  patch: {
    status?: UploadSessionRecord["status"];
    uploadedBytes?: number;
    parts?: unknown[];
    multipartUploadId?: string | null;
    partSize?: number | null;
    fileId?: string | null;
    errorMessage?: string | null;
    checksum?: string | null;
    completedAt?: string | null;
  },
): Promise<UploadSessionRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown): void => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.status !== undefined) push("status", patch.status);
  if (patch.uploadedBytes !== undefined) push("uploaded_bytes", patch.uploadedBytes);
  if (patch.parts !== undefined) push("parts", JSON.stringify(patch.parts));
  if (patch.multipartUploadId !== undefined) push("multipart_upload_id", patch.multipartUploadId);
  if (patch.partSize !== undefined) push("part_size", patch.partSize);
  if (patch.fileId !== undefined) push("file_id", patch.fileId);
  if (patch.errorMessage !== undefined) push("error_message", patch.errorMessage);
  if (patch.checksum !== undefined) push("checksum", patch.checksum);
  if (patch.completedAt !== undefined) push("completed_at", patch.completedAt);

  if (sets.length === 0) return getUploadSession(db, userId, sessionId);

  params.push(sessionId, userId);
  const rows = await db.query<UploadSessionRecord>(
    `update public.upload_sessions set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length - 1} and user_id = $${params.length}
      returning ${UPLOAD_COLUMNS}`,
    params,
  );
  return rows[0] ?? null;
}

export async function listUploadSessions(
  db: Db,
  userId: string,
  options?: { statuses?: UploadSessionRecord["status"][]; limit?: number },
): Promise<UploadSessionRecord[]> {
  const statuses = options?.statuses ?? [];
  const limit = Math.min(200, Math.max(1, options?.limit ?? 50));
  if (statuses.length > 0) {
    return db.query<UploadSessionRecord>(
      `select ${UPLOAD_COLUMNS} from public.upload_sessions
        where user_id = $1 and status = any($2::text[])
        order by created_at desc limit ${limit}`,
      [userId, statuses],
    );
  }
  return db.query<UploadSessionRecord>(
    `select ${UPLOAD_COLUMNS} from public.upload_sessions
      where user_id = $1 order by created_at desc limit ${limit}`,
    [userId],
  );
}

export async function countUploadSessions(
  db: Db,
  userId: string,
): Promise<{ active: number; completed: number; failed: number }> {
  const rows = await db.query<{ bucket: string; count: number }>(
    `select case
              when status in ('preparing','uploading','paused','completing') then 'active'
              when status = 'completed' then 'completed'
              when status in ('failed','canceled') then 'failed'
              else 'other' end as bucket,
            count(*)::int as count
       from public.upload_sessions
      where user_id = $1
      group by 1`,
    [userId],
  );
  const result = { active: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    if (row.bucket === "active") result.active = row.count;
    if (row.bucket === "completed") result.completed = row.count;
    if (row.bucket === "failed") result.failed = row.count;
  }
  return result;
}
