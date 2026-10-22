import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { z } from "zod";
import { withUser } from "@/lib/db/client";
import { getFile, setFavorite } from "@/lib/db/repo/files";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const favoriteSchema = z.object({ favorite: z.boolean() });

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;
    const input = await parseJsonBody(request, favoriteSchema);

    const result = await withUser(user.id, async (db) => {
      const file = await getFile(db, user.id, id);
      if (!file) return null;
      const favorite = await setFavorite(db, user.id, id, input.favorite);
      return { favorite };
    });

    if (!result) return jsonError("Arquivo nao encontrado.", 404);
    return json(result);
  } catch (error) {
    return handleError(error);
  }
}
