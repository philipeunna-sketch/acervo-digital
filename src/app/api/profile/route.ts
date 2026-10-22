import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError, parseJsonBody } from "@/lib/api/http";
import { updateProfileSchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { logAudit } from "@/lib/db/repo/audit";

export const runtime = "nodejs";

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const input = await parseJsonBody(request, updateProfileSchema);

    const profile = await withUser(user.id, async (db) => {
      const rows = await db.query<{ id: string; email: string; full_name: string | null; role: string }>(
        `update public.profiles set full_name = $2, updated_at = now() where id = $1
         returning id, email, full_name, role`,
        [user.id, input.fullName ?? null],
      );
      if (rows[0]?.full_name) {
        await db.query(`update public.local_users set full_name = $2 where id = $1`, [user.id, rows[0].full_name]).catch(
          () => undefined,
        );
      }
      await logAudit(db, {
        userId: user.id,
        action: "profile.updated",
        entityType: "user",
        entityId: user.id,
      });
      return rows[0] ?? null;
    });

    if (!profile) return jsonError("Perfil nao encontrado.", 404);
    return json({ profile });
  } catch (error) {
    return handleError(error);
  }
}
