import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { fileUpdateSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { getFile, getAlbumIdsForFile, setFileAlbums, updateFile } from "@/lib/db/repo/files";
import { listFileTags, setFileTags } from "@/lib/db/repo/tags";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const payload = await withUser(user.id, async (db) => {
      const file = await getFile(db, user.id, id);
      if (!file) return null;
      const tags = await listFileTags(db, user.id, id);
      const albumIds = await getAlbumIdsForFile(db, user.id, id);
      return { file, tags, albumIds };
    });

    if (!payload) return jsonError("Arquivo nao encontrado.", 404);
    return json(payload);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const input = await parseJsonBody(request, fileUpdateSchema);

    const payload = await withUser(user.id, async (db) => {
      const existing = await getFile(db, user.id, id);
      if (!existing) return null;

      if (input.name !== undefined || input.description !== undefined) {
        await updateFile(db, user.id, id, {
          name: input.name,
          description: input.description,
        });
      }
      if (input.tags !== undefined) {
        await setFileTags(db, user.id, id, input.tags);
      }
      if (input.albumIds !== undefined) {
        await setFileAlbums(db, user.id, id, input.albumIds);
      }

      const file = await getFile(db, user.id, id);
      const tags = await listFileTags(db, user.id, id);
      const albumIds = await getAlbumIdsForFile(db, user.id, id);
      await logAudit(db, {
        userId: user.id,
        action: "file.updated",
        entityType: "file",
        entityId: id,
        metadata: { hasName: input.name !== undefined, hasTags: input.tags !== undefined },
      });
      return { file, tags, albumIds };
    });

    if (!payload) return jsonError("Arquivo nao encontrado.", 404);
    return json(payload);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const result = await withUser(user.id, async (db) => {
      const file = await getFile(db, user.id, id);
      if (!file) return false;
      await db.query(
        `update public.files set status = 'trashed', trashed_at = now(), updated_at = now()
          where id = $1 and user_id = $2`,
        [id, user.id],
      );
      await logAudit(db, {
        userId: user.id,
        action: "file.trashed",
        entityType: "file",
        entityId: id,
        metadata: { name: file.name },
      });
      return true;
    });

    if (!result) return jsonError("Arquivo nao encontrado.", 404);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
