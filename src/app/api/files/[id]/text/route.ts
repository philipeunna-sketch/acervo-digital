import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { handleError, json, jsonError } from "@/lib/api/http";
import { withUser } from "@/lib/db/client";
import { getFile, updateFile } from "@/lib/db/repo/files";
import { resolveStorageProvider } from "@/lib/storage/registry";
import { canExtractText, extractText, MAX_TEXT_EXTRACT_BYTES, summarize } from "@/lib/content/extract-text";
import { LocalStorageProvider } from "@/lib/storage/local";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/**
 * Retorna o conteudo textual de documentos que podem ser extraidos com
 * seguranca (txt, md, rtf, docx). PDF e demais formatos sao exibidos pelo
 * visualizador nativo do navegador.
 */
export async function GET(_request: Request, context: Context): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("Nao autenticado.", 401);
    const { id } = await context.params;

    const payload = await withUser(user.id, async (db) => {
      const file = await getFile(db, user.id, id);
      if (!file) return { kind: "missing" as const };
      if (!canExtractText(file.name)) {
        return { kind: "unsupported" as const, message: "Este formato nao permite extracao de texto." };
      }
      if (file.size_bytes > MAX_TEXT_EXTRACT_BYTES) {
        return {
          kind: "too_large" as const,
          message: `O arquivo excede o limite de ${Math.round(MAX_TEXT_EXTRACT_BYTES / (1024 * 1024))} MB para extracao de texto.`,
        };
      }

      const provider = await resolveStorageProvider(db, user.id, file.provider_id);
      let data: Uint8Array;

      if (provider instanceof LocalStorageProvider) {
        const stream = provider.createReadStream(file.storage_key);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        data = new Uint8Array(Buffer.concat(chunks));
      } else {
        const signed = await provider.signDownload({ key: file.storage_key, expiresIn: 120 });
        const response = await fetch(signed);
        if (!response.ok) throw new Error("Falha ao baixar o conteudo do storage.");
        data = new Uint8Array(await response.arrayBuffer());
      }

      const text = await extractText(file.name, data);
      const excerpt = summarize(text);
      if (!file.text_extracted) {
        await updateFile(db, user.id, file.id, { textExtracted: true, excerpt });
      }
      return { kind: "ok" as const, text, excerpt };
    });

    if (payload.kind === "missing") return jsonError("Arquivo nao encontrado.", 404);
    if (payload.kind === "unsupported") return json(payload, { status: 200 });
    if (payload.kind === "too_large") return json(payload, { status: 200 });
    return json(payload);
  } catch (error) {
    return handleError(error);
  }
}
