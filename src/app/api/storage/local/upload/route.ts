import { NextResponse } from "next/server";
import { LocalStorageProvider } from "@/lib/storage/local";
import { handleError, json, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

/** Recebe o upload de objeto unico no driver local (desenvolvimento). */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const expires = Number(url.searchParams.get("expires") ?? 0);
    const signature = url.searchParams.get("signature") ?? "";

    if (!key || !expires || !signature) return jsonError("URL invalida.", 400);
    if (Date.now() / 1000 > expires) return jsonError("URL expirada.", 403);

    const provider = new LocalStorageProvider();
    if (!provider.verifySignature(`${key}|${expires}|upload`, signature)) {
      return jsonError("Assinatura invalida.", 403);
    }

    const body = new Uint8Array(await request.arrayBuffer());
    await provider.putObject({ key, body, contentType: request.headers.get("content-type") ?? undefined });
    return json({ ok: true, size: body.byteLength });
  } catch (error) {
    return handleError(error);
  }
}
