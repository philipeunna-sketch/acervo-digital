import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { uploadInitiateSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { createUploadSession } from "@/lib/db/repo/uploads";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { buildStorageKey } from "@/lib/storage/keys";
import { getEnv } from "@/lib/env";
import {
  extensionOf,
  isAllowedUpload,
  isMimeConsistent,
  mimeFor,
} from "@/lib/validation/file-types";
import { logAudit } from "@/lib/db/repo/audit";
import { clientIdentifier, rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const S3_MAX_PARTS = 10000;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const env = getEnv();
    const limit = await rateLimit(
      `upload:${clientIdentifier(request, user.id)}`,
      {
        limit: 300,
        windowSeconds: 60,
      },
    );
    if (!limit.allowed)
      return jsonError("Limite de uploads atingido. Aguarde um instante.", 429);

    const input = await parseJsonBody(request, uploadInitiateSchema);

    if (!isAllowedUpload(input.fileName)) {
      return jsonError(
        `Formato de arquivo nao suportado: .${extensionOf(input.fileName) || "?"}`,
        415,
      );
    }
    if (!isMimeConsistent(input.fileName, input.mimeType)) {
      return jsonError(
        "O tipo declarado nao corresponde a extensao do arquivo.",
        415,
      );
    }
    if (input.size <= 0) return jsonError("Tamanho de arquivo invalido.", 400);
    if (input.size > env.MAX_UPLOAD_SIZE) {
      return jsonError(
        `Arquivo maior que o limite de ${Math.round(env.MAX_UPLOAD_SIZE / (1024 * 1024 * 1024))} GB.`,
        413,
      );
    }

    const mimeType = mimeFor(input.fileName, input.mimeType);

    const result = await withUser(user.id, async (db) => {
      const provider = await resolveStorageProvider(
        db,
        user.id,
        input.providerId ?? null,
      );
      const key = buildStorageKey(user.id, input.fileName);
      const partSize = Math.max(5 * 1024 * 1024, env.MULTIPART_PART_SIZE);
      const partCount = Math.ceil(input.size / partSize);

      if (partCount > S3_MAX_PARTS) {
        throw new Error(
          "Arquivo excede o numero maximo de partes suportado pelo provedor.",
        );
      }

      if (partCount <= 1) {
        const singleUrl = await provider.signUploadObject({
          key,
          contentType: mimeType,
          expiresIn: 60 * 60,
        });

        const session = await createUploadSession(db, {
          userId: user.id,
          fileName: input.fileName,
          sizeBytes: input.size,
          mimeType,
          providerId: provider.id ?? null,
          storageKey: key,
          multipartUploadId: null,
          partSize: null,
          status: "uploading",
        });

        return {
          sessionId: session.id,
          mode: "single" as const,
          url: singleUrl,
          method: "PUT" as const,
          headers: { "Content-Type": mimeType },
          partSize: null,
          partCount: 1,
          providerKind: provider.kind,
          storageKey: key,
        };
      }

      const multipart = await provider.createMultipartUpload({
        key,
        contentType: mimeType,
        contentLength: input.size,
        metadata: { originalname: input.fileName },
      });

      const session = await createUploadSession(db, {
        userId: user.id,
        fileName: input.fileName,
        sizeBytes: input.size,
        mimeType,
        providerId: provider.id ?? null,
        storageKey: key,
        multipartUploadId: multipart.uploadId,
        partSize,
        status: "uploading",
      });

      return {
        sessionId: session.id,
        mode: "multipart" as const,
        url: null,
        method: "PUT" as const,
        headers: { "Content-Type": mimeType },
        partSize,
        partCount,
        maxPartsPerBatch: env.MULTIPART_MAX_PARTS,
        providerKind: provider.kind,
        storageKey: key,
      };
    });

    await withUser(user.id, (db) =>
      logAudit(db, {
        userId: user.id,
        action: "upload.initiated",
        entityType: "file",
        entityId: result.sessionId,
        metadata: { name: input.fileName, size: input.size, mode: result.mode },
      }),
    );

    return json(result);
  } catch (error) {
    return handleError(error);
  }
}
