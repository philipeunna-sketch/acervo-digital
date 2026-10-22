import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { albumUpdateSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { deleteAlbum, getAlbum, updateAlbum } from "@/lib/db/repo/albums";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const album = await withUser(user.id, (db) => getAlbum(db, user.id, id));
    if (!album) return jsonError("Album nao encontrado.", 404);
    return json({ album });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const input = await parseJsonBody(request, albumUpdateSchema);

    const album = await withUser(user.id, (db) =>
      updateAlbum(db, user.id, id, {
        name: input.name,
        description: input.description,
        coverFileId: input.coverFileId,
      }),
    );
    if (!album) return jsonError("Album nao encontrado.", 404);
    return json({ album });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const url = new URL(request.url);
    const deleteFiles = url.searchParams.get("deleteFiles") === "true";

    const result = await withUser(user.id, async (db) => {
      const album = await getAlbum(db, user.id, id);
      if (!album) return null;

      // Por padrao as imagens do album sao preservadas (apenas o vinculo some).
      if (deleteFiles) {
        await db.query(
          `update public.files set status = 'trashed', trashed_at = now(), updated_at = now()
            where id in (select file_id from public.album_files where album_id = $1) and user_id = $2`,
          [id, user.id],
        );
      }
      await deleteAlbum(db, user.id, id);
      await logAudit(db, {
        userId: user.id,
        action: "album.deleted",
        entityType: "album",
        entityId: id,
        metadata: { name: album.name, filesTrashed: deleteFiles },
      });
      return { deleted: true, filesTrashed: deleteFiles };
    });

    if (!result) return jsonError("Album nao encontrado.", 404);
    return json({ ok: true, ...result });
  } catch (error) {
    return handleError(error);
  }
}
