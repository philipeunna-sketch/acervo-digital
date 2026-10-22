import type { Db } from "@/lib/db/client";
import type { ImportCandidateRecord, ImportJobRecord } from "@/types";

const JOB_COLUMNS = `
  id, user_id, mode, query, url, status, provider, ai_model, album_id, provider_id,
  stats, error_message, created_at, updated_at, completed_at
`;

const CANDIDATE_COLUMNS = `
  id, job_id, media_type, title, description, source_url, download_url, thumbnail_url,
  mime_type, size_bytes, width, height, duration_seconds, suggested_name, suggested_tags,
  ai_confidence, selected, status, imported_file_id, error_message, created_at, updated_at
`;

export async function createJob(
  db: Db,
  input: {
    userId: string;
    mode: "search" | "url";
    query?: string | null;
    url?: string | null;
    provider?: string | null;
    aiModel?: string | null;
  },
): Promise<ImportJobRecord> {
  const rows = await db.query<ImportJobRecord>(
    `insert into public.import_jobs (user_id, mode, query, url, provider, ai_model, status)
     values ($1,$2,$3,$4,$5,$6,'pending')
     returning ${JOB_COLUMNS}`,
    [
      input.userId,
      input.mode,
      input.query ?? null,
      input.url ?? null,
      input.provider ?? null,
      input.aiModel ?? null,
    ],
  );
  return rows[0]!;
}

export async function updateJob(
  db: Db,
  userId: string,
  jobId: string,
  patch: {
    status?: ImportJobRecord["status"];
    provider?: string | null;
    aiModel?: string | null;
    albumId?: string | null;
    providerId?: string | null;
    stats?: Record<string, unknown>;
    errorMessage?: string | null;
    completedAt?: string | null;
  },
): Promise<ImportJobRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown): void => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.status !== undefined) push("status", patch.status);
  if (patch.provider !== undefined) push("provider", patch.provider);
  if (patch.aiModel !== undefined) push("ai_model", patch.aiModel);
  if (patch.albumId !== undefined) push("album_id", patch.albumId);
  if (patch.providerId !== undefined) push("provider_id", patch.providerId);
  if (patch.stats !== undefined) push("stats", JSON.stringify(patch.stats));
  if (patch.errorMessage !== undefined) push("error_message", patch.errorMessage);
  if (patch.completedAt !== undefined) push("completed_at", patch.completedAt);

  if (sets.length === 0) return getJob(db, userId, jobId);

  params.push(jobId, userId);
  const rows = await db.query<ImportJobRecord>(
    `update public.import_jobs set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length - 1} and user_id = $${params.length}
      returning ${JOB_COLUMNS}`,
    params,
  );
  return rows[0] ?? null;
}

export async function getJob(db: Db, userId: string, jobId: string): Promise<ImportJobRecord | null> {
  const rows = await db.query<ImportJobRecord>(
    `select ${JOB_COLUMNS} from public.import_jobs where id = $1 and user_id = $2 limit 1`,
    [jobId, userId],
  );
  return rows[0] ?? null;
}

export async function listJobs(db: Db, userId: string, limit = 20): Promise<ImportJobRecord[]> {
  return db.query<ImportJobRecord>(
    `select ${JOB_COLUMNS} from public.import_jobs where user_id = $1 order by created_at desc limit ${limit}`,
    [userId],
  );
}

export interface CandidateInput {
  jobId: string;
  mediaType: ImportCandidateRecord["media_type"];
  title: string | null;
  description: string | null;
  sourceUrl: string;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  suggestedName: string | null;
  suggestedTags: string[];
  aiConfidence: number | null;
}

export async function createCandidates(
  db: Db,
  inputs: CandidateInput[],
): Promise<ImportCandidateRecord[]> {
  if (inputs.length === 0) return [];
  const values: unknown[] = [];
  const tuples: string[] = [];
  inputs.forEach((input, index) => {
    const base = index * 15;
    values.push(
      input.jobId,
      input.mediaType,
      input.title,
      input.description,
      input.sourceUrl,
      input.downloadUrl,
      input.thumbnailUrl,
      input.mimeType,
      input.sizeBytes,
      input.width,
      input.height,
      input.durationSeconds,
      input.suggestedName,
      JSON.stringify(input.suggestedTags),
      input.aiConfidence,
    );
    tuples.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14}::jsonb,$${base + 15})`,
    );
  });

  return db.query<ImportCandidateRecord>(
    `insert into public.import_candidates (
        job_id, media_type, title, description, source_url, download_url, thumbnail_url,
        mime_type, size_bytes, width, height, duration_seconds, suggested_name, suggested_tags, ai_confidence
     ) values ${tuples.join(", ")}
     returning ${CANDIDATE_COLUMNS}`,
    values,
  );
}

export async function listCandidates(
  db: Db,
  userId: string,
  jobId: string,
): Promise<ImportCandidateRecord[]> {
  return db.query<ImportCandidateRecord>(
    `select c.id, c.job_id, c.media_type, c.title, c.description, c.source_url, c.download_url,
            c.thumbnail_url, c.mime_type, c.size_bytes, c.width, c.height, c.duration_seconds,
            c.suggested_name, c.suggested_tags, c.ai_confidence, c.selected, c.status,
            c.imported_file_id, c.error_message, c.created_at, c.updated_at
       from public.import_candidates c
       join public.import_jobs j on j.id = c.job_id
      where c.job_id = $1 and j.user_id = $2
      order by c.created_at asc`,
    [jobId, userId],
  );
}

export async function getCandidate(
  db: Db,
  userId: string,
  candidateId: string,
): Promise<ImportCandidateRecord | null> {
  const rows = await db.query<ImportCandidateRecord>(
    `select ${CANDIDATE_COLUMNS} from public.import_candidates where id = $1 limit 1`,
    [candidateId],
  );
  return rows[0] ?? null;
}

export async function updateCandidate(
  db: Db,
  userId: string,
  candidateId: string,
  patch: {
    selected?: boolean;
    suggestedName?: string | null;
    status?: ImportCandidateRecord["status"];
    importedFileId?: string | null;
    errorMessage?: string | null;
    mediaType?: ImportCandidateRecord["media_type"];
    suggestedTags?: string[];
  },
): Promise<ImportCandidateRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown): void => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };

  if (patch.selected !== undefined) push("selected", patch.selected);
  if (patch.suggestedName !== undefined) push("suggested_name", patch.suggestedName);
  if (patch.status !== undefined) push("status", patch.status);
  if (patch.importedFileId !== undefined) push("imported_file_id", patch.importedFileId);
  if (patch.errorMessage !== undefined) push("error_message", patch.errorMessage);
  if (patch.mediaType !== undefined) push("media_type", patch.mediaType);
  if (patch.suggestedTags !== undefined) push("suggested_tags", JSON.stringify(patch.suggestedTags));

  if (sets.length === 0) return getCandidate(db, userId, candidateId);

  params.push(candidateId);
  const rows = await db.query<ImportCandidateRecord>(
    `update public.import_candidates set ${sets.join(", ")}, updated_at = now()
      where id = $${params.length}
        and exists (select 1 from public.import_jobs j where j.id = public.import_candidates.job_id and j.user_id = $${params.length + 1})
      returning ${CANDIDATE_COLUMNS}`,
    [...params, userId],
  );
  return rows[0] ?? null;
}

export async function candidatesForJob(
  db: Db,
  userId: string,
  jobId: string,
  ids: string[],
): Promise<ImportCandidateRecord[]> {
  if (ids.length === 0) return [];
  return db.query<ImportCandidateRecord>(
    `select ${CANDIDATE_COLUMNS}
       from public.import_candidates c
       join public.import_jobs j on j.id = c.job_id
      where c.job_id = $1 and c.id = any($2::uuid[]) and j.user_id = $3`,
    [jobId, ids, userId],
  );
}
