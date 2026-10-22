import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { restoreFromTrash } from "@/lib/db/repo/files";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const restored = await withUser(user.id, async (db) => {
      const count = await restoreFromTrash(db, user.id, [id]);
      if (count > 0) {
        await logAudit(db, {
          userId: user.id,
          action: "file.restored",
          entityType: "file",
          entityId: id,
        });
      }
      return count;
    });

    if (restored === 0) return jsonError("Arquivo nao encontrado na lixeira.", 404);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
