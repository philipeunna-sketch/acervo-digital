import { NextResponse } from "next/server";
import { LocalStorageProvider } from "@/lib/storage/local";
import { handleError, json, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

/** Recebe uma parte do upload multipart no driver local (desenvolvimento). */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const uploadId = url.searchParams.get("uploadId");
    const partNumber = Number(url.searchParams.get("partNumber") ?? 0);
    const expires = Number(url.searchParams.get("expires") ?? 0);
    const signature = url.searchParams.get("signature") ?? "";

    if (!key || !uploadId || !partNumber || !expires || !signature) {
      return jsonError("URL invalida.", 400);
    }
    if (Date.now() / 1000 > expires) return jsonError("URL expirada.", 403);

    const provider = new LocalStorageProvider();
    const payload = `${key}|${uploadId}|${partNumber}|${expires}`;
    if (!provider.verifySignature(payload, signature)) {
      return jsonError("Assinatura invalida.", 403);
    }

    const body = new Uint8Array(await request.arrayBuffer());
    await provider.writePart(uploadId, partNumber, body);
    return json({ ok: true, size: body.byteLength });
  } catch (error) {
    return handleError(error);
  }
}
