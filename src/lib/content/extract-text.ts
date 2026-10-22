import { extname } from "node:path";
import { TEXT_EXTRACTABLE_EXTENSIONS } from "@/lib/validation/file-types";

/**
 * Extracao de texto de documentos, executada no servidor.
 * O processamento respeita um limite de tamanho: arquivos grandes sao apenas
 * indexados como "sem pre-visualizacao".
 */

export const MAX_TEXT_EXTRACT_BYTES = 5 * 1024 * 1024;

export function canExtractText(fileName: string): boolean {
  const ext = extname(fileName).replace(".", "").toLowerCase();
  return (TEXT_EXTRACTABLE_EXTENSIONS as readonly string[]).includes(ext);
}

export async function extractText(fileName: string, data: Uint8Array): Promise<string> {
  const ext = extname(fileName).replace(".", "").toLowerCase();

  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return new TextDecoder("utf-8").decode(data);
  }
  if (ext === "rtf") {
    return stripRtf(new TextDecoder("utf-8").decode(data));
  }
  if (ext === "docx") {
    return extractDocx(data);
  }
  return "";
}

function stripRtf(input: string): string {
  return input
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

async function extractDocx(data: Uint8Array): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const buffer = Buffer.from(data);
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error("[content] falha ao extrair DOCX:", error instanceof Error ? error.message : error);
    return "";
  }
}

export function summarize(text: string, maxLength = 600): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
