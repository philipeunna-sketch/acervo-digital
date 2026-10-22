import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { z } from "zod";
import { withUser } from "@/lib/db/client";
import { addFilesToAlbum, albumFiles, removeFilesFromAlbum } from "@/lib/db/repo/albums";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const albumFilesSchema = z.object({
  fileIds: z.array(z.string().uuid()).min(1).max(500),
});

export async function GET(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1) || 1;
    const pageSize = Number(url.searchParams.get("pageSize") ?? 48) || 48;

    const result = await withUser(user.id, (db) => albumFiles(db, user.id, id, { page, pageSize }));
    return json({ items: result.items, total: result.total, page, pageSize });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const input = await parseJsonBody(request, albumFilesSchema);

    const count = await withUser(user.id, (db) => addFilesToAlbum(db, user.id, id, input.fileIds));
    return json({ ok: true, added: count });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const input = await parseJsonBody(request, albumFilesSchema);

    const count = await withUser(user.id, (db) => removeFilesFromAlbum(db, user.id, id, input.fileIds));
    return json({ ok: true, removed: count });
  } catch (error) {
    return handleError(error);
  }
}
