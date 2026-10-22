import { safeFetch, readLimitedBody } from "@/lib/security/ssrf";
import { getEnv } from "@/lib/env";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { buildImportStorageKey } from "@/lib/storage/keys";
import { insertFile, setFileAlbums } from "@/lib/db/repo/files";
import { updateCandidate, updateJob } from "@/lib/db/repo/imports";
import { categoryOf, extensionOf, mimeFor } from "@/lib/validation/file-types";
import { withUser } from "@/lib/db/client";
import { logAudit } from "@/lib/db/repo/audit";
import type { Db } from "@/lib/db/client";
import type { ImportCandidateRecord } from "@/types";

/**
 * Job de importacao: baixa as midias selecionadas (com protecao SSRF), envia
 * ao provedor de armazenamento escolhido e registra os metadados no acervo.
 *
 * Cada item e processado de forma independente: uma falha isolada nao
 * interrompe o restante da importacao.
 */

const ALLOWED_MEDIA_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "application/pdf",
  "text/plain",
  "application/octet-stream",
]);

export interface ImportOutcome {
  imported: number;
  failed: number;
  fileIds: string[];
  errors: Array<{ candidateId: string; message: string }>;
}

export async function runImportJob(
  db: Db,
  userId: string,
  jobId: string,
  candidateIds: string[],
  options: { providerId?: string | null; albumId?: string | null },
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { imported: 0, failed: 0, fileIds: [], errors: [] };
  const env = getEnv();
  const provider = await resolveStorageProvider(db, userId, options.providerId ?? null);

  const candidates = (
    await db.query<ImportCandidateRecord>(
      `select id, job_id, media_type, title, description, source_url, download_url, thumbnail_url,
              mime_type, size_bytes, width, height, duration_seconds, suggested_name, suggested_tags,
              ai_confidence, selected, status, imported_file_id, error_message, created_at, updated_at
         from public.import_candidates
        where job_id = $1 and id = any($2::uuid[])`,
      [jobId, candidateIds],
    )
  ).filter((candidate) => candidate.status === "found" || candidate.status === "failed");

  await updateJob(db, userId, jobId, { status: "running" });

  for (const candidate of candidates) {
    try {
      await updateCandidate(db, userId, candidate.id, { status: "importing" });

      const downloadUrl = candidate.download_url ?? candidate.source_url;
      if (!downloadUrl) throw new Error("A midia nao possui URL de download.");

      const response = await safeFetch(downloadUrl, {
        timeoutMs: 30000,
        maxBytes: env.IMPORT_MAX_MEDIA_SIZE,
        headers: { "User-Agent": env.FETCH_USER_AGENT ?? "AcervoDigitalBot/1.0" },
      });
      if (!response.ok) throw new Error(`Origem respondeu HTTP ${response.status}.`);

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
      if (contentType && !ALLOWED_MEDIA_MIME.has(contentType)) {
        throw new Error(`Tipo de conteudo nao suportado: ${contentType}`);
      }

      const buffer = new Uint8Array(await readLimitedBody(response, env.IMPORT_MAX_MEDIA_SIZE));
      if (buffer.byteLength === 0) throw new Error("Conteudo vazio.");

      const name = candidate.suggested_name?.trim() || candidate.title?.trim() || `importado-${Date.now()}`;
      const extension = extensionOf(name) || extensionOf(downloadUrl) || guessExtension(contentType);
      const fileName = extension ? `${name.replace(/\.[^.]+$/, "")}.${extension}` : name;
      const mimeType = mimeFor(fileName, contentType || candidate.mime_type || undefined);
      const key = buildImportStorageKey(userId, candidate.source_url, fileName);

      const uploaded = await provider.putObject({
        key,
        body: buffer,
        contentType: mimeType,
        contentLength: buffer.byteLength,
        metadata: { source: "import", origin: candidate.source_url.slice(0, 300) },
      });

      const file = await insertFile(db, {
        userId,
        name: fileName,
        originalName: fileName,
        extension: extension || null,
        mimeType,
        sizeBytes: uploaded.size || buffer.byteLength,
        category: categoryOf(extension || fileName) as never,
        providerId: provider.id ?? null,
        providerKind: provider.kind,
        storageKey: key,
        source: "import",
        sourceUrl: candidate.source_url,
        sourceMeta: {
          jobId,
          candidateId: candidate.id,
          aiConfidence: candidate.ai_confidence,
          tags: candidate.suggested_tags,
        },
        mediaMeta: {
          width: candidate.width ?? undefined,
          height: candidate.height ?? undefined,
          duration: candidate.duration_seconds ?? undefined,
        },
        description: candidate.description,
      });

      if (options.albumId) {
        await setFileAlbums(db, userId, file.id, [options.albumId]);
      }

      await updateCandidate(db, userId, candidate.id, {
        status: "imported",
        importedFileId: file.id,
        errorMessage: null,
      });

      outcome.imported += 1;
      outcome.fileIds.push(file.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao importar a midia.";
      outcome.failed += 1;
      outcome.errors.push({ candidateId: candidate.id, message });
      await updateCandidate(db, userId, candidate.id, { status: "failed", errorMessage: message });
    }
  }

  await updateJob(db, userId, jobId, {
    status: outcome.failed === 0 ? "completed" : outcome.imported === 0 ? "failed" : "partial",
    stats: {
      imported: outcome.imported,
      failed: outcome.failed,
      total: candidates.length,
    },
    completedAt: new Date().toISOString(),
  });

  await logAudit(db, {
    userId,
    action: "import.completed",
    entityType: "import_job",
    entityId: jobId,
    metadata: { imported: outcome.imported, failed: outcome.failed },
  });

  return outcome;
}

/** Executa o job dentro do contexto de usuario (RLS aplicado). */
export async function runImportJobForUser(
  userId: string,
  jobId: string,
  candidateIds: string[],
  options: { providerId?: string | null; albumId?: string | null },
): Promise<ImportOutcome> {
  return withUser(userId, (db) => runImportJob(db, userId, jobId, candidateIds, options));
}

function guessExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "application/pdf": "pdf",
    "text/plain": "txt",
  };
  return map[mime] ?? "bin";
}
