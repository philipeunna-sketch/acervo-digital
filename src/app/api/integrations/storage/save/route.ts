import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { storageProviderSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { encryptSecret } from "@/lib/security/crypto";
import { invalidateStorageCache } from "@/lib/storage/registry";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

/** Cadastra ou atualiza um provedor de armazenamento compativel com S3. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, storageProviderSchema);

    if (input.kind === "s3") {
      if (!input.endpoint || !input.bucket || !input.accessKeyId || !input.secretAccessKey) {
        return jsonError(
          "Informe endpoint, bucket, access key e secret key para um provedor S3.",
          400,
        );
      }
    }

    const provider = await withUser(user.id, async (db) => {
      const existing = await db.query<{ id: string }>(
        `select id from public.storage_providers
          where user_id = $1 and kind = $2 and coalesce(bucket, '') = $3
          limit 1`,
        [user.id, input.kind, input.bucket ?? ""],
      );

      if (existing[0]) {
        const rows = await db.query<{ id: string; name: string }>(
          `update public.storage_providers
              set name = $2, endpoint = $3, region = $4, bucket = $5, access_key_id = $6,
                  secret_access_key = $7, config = $8::jsonb, is_active = true, updated_at = now()
            where id = $1
            returning id, name`,
          [
            existing[0].id,
            input.name,
            input.endpoint || null,
            input.region || "us-east-1",
            input.bucket || null,
            input.accessKeyId || null,
            input.secretAccessKey ? encryptSecret(input.secretAccessKey) : null,
            JSON.stringify({ forcePathStyle: input.forcePathStyle ?? true }),
          ],
        );
        invalidateStorageCache(existing[0].id);
        return rows[0]!;
      }

      const rows = await db.query<{ id: string; name: string }>(
        `insert into public.storage_providers (
            user_id, is_system, name, kind, endpoint, region, bucket, access_key_id,
            secret_access_key, is_default, is_active, config
         ) values ($1, false, $2, $3, $4, $5, $6, $7, $8, $9, true, $10::jsonb)
         returning id, name`,
        [
          user.id,
          input.name,
          input.kind,
          input.endpoint || null,
          input.region || "us-east-1",
          input.bucket || null,
          input.accessKeyId || null,
          input.secretAccessKey ? encryptSecret(input.secretAccessKey) : null,
          input.isDefault ?? false,
          JSON.stringify({ forcePathStyle: input.forcePathStyle ?? true }),
        ],
      );
      return rows[0]!;
    });

    await withUser(user.id, (db) =>
      logAudit(db, {
        userId: user.id,
        action: "integration.storage.saved",
        entityType: "storage_provider",
        entityId: provider.id,
        metadata: { name: provider.name, kind: input.kind },
      }),
    );

    return json({ ok: true, provider });
  } catch (error) {
    return handleError(error);
  }
}
