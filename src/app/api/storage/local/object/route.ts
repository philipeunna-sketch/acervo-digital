import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { LocalStorageProvider } from "@/lib/storage/local";
import { handleError, jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

/**
 * Serve um objeto do driver de armazenamento local, mediante URL assinada e
 * expirada. Usado apenas em desenvolvimento.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    const expires = Number(url.searchParams.get("expires") ?? 0);
    const signature = url.searchParams.get("signature") ?? "";
    const filename = url.searchParams.get("filename") ?? "";
    const download = url.searchParams.get("download") === "1";

    if (!key || !expires || !signature) return jsonError("URL invalida.", 400);
    if (Date.now() / 1000 > expires) return jsonError("URL expirada.", 403);

    const provider = new LocalStorageProvider();
    const payload = `${key}|${expires}|${filename}`;
    if (!provider.verifySignature(payload, signature)) {
      return jsonError("Assinatura invalida.", 403);
    }

    const filePath = provider.resolveKeyForRead(key);
    let info;
    try {
      info = await stat(filePath);
    } catch {
      return jsonError("Objeto nao encontrado.", 404);
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(info.size),
      "Cache-Control": "private, max-age=300",
    });
    if (filename) {
      headers.set(
        "Content-Disposition",
        `${download ? "attachment" : "inline"}; filename="${filename.replaceAll('"', "")}"`,
      );
    }
    return new Response(stream, { headers });
  } catch (error) {
    return handleError(error);
  }
}
