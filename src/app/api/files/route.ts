import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { libraryQuerySchema } from "@/lib/validation/schemas";
import { withUser } from "@/lib/db/client";
import { listFiles } from "@/lib/db/repo/files";
import { listProviders } from "@/lib/storage/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);

    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const query = libraryQuerySchema.parse({
      ...params,
      favorite: params.favorite === undefined ? undefined : params.favorite === "true",
    });

    const result = await withUser(user.id, async (db) => {
      const files = await listFiles(db, user.id, {
        q: query.q,
        category: query.category,
        providerId: query.providerId,
        albumId: query.albumId,
        from: query.from,
        to: query.to,
        minSize: query.minSize,
        maxSize: query.maxSize,
        favorite: query.favorite,
        processed: query.processed,
        status: query.status,
        extension: query.extension,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      });
      const providers = await listProviders(db, user.id);
      return { files, providers };
    });

    return json({
      ...result.files,
      providers: result.providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        is_default: provider.is_default,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
