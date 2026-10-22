import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { searchFiles } from "@/lib/db/repo/files";
import { listAlbums } from "@/lib/db/repo/albums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const term = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (term.length < 2) return json({ files: [], albums: [] });

    const payload = await withUser(user.id, async (db) => {
      const files = await searchFiles(db, user.id, term, 8);
      const albums = (await listAlbums(db, user.id)).filter((album) =>
        album.name.toLowerCase().includes(term.toLowerCase()),
      );
      return { files, albums };
    });

    return json(payload);
  } catch (error) {
    return handleError(error);
  }
}
