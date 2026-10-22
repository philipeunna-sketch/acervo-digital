import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { albumCreateSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { createAlbum, listAlbums } from "@/lib/db/repo/albums";
import { setFileTags } from "@/lib/db/repo/tags";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const albums = await withUser(user.id, (db) => listAlbums(db, user.id));
    return json({ albums });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, albumCreateSchema);

    const album = await withUser(user.id, async (db) => {
      const created = await createAlbum(db, user.id, {
        name: input.name,
        description: input.description ?? null,
        coverFileId: input.coverFileId ?? null,
      });
      if (input.tags?.length) {
        // Tags do album sao mantidas nas tags do arquivo de capa, quando existir.
        if (input.coverFileId) await setFileTags(db, user.id, input.coverFileId, input.tags);
      }
      await logAudit(db, {
        userId: user.id,
        action: "album.created",
        entityType: "album",
        entityId: created.id,
        metadata: { name: created.name },
      });
      return created;
    });

    return json({ album }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
