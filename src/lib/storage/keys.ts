import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Geracao de chaves (paths) de objetos.
 *
 * Formato: `<userId>/<ano>/<mes>/<uuid>-<nome-sanitizado>`
 * - isola arquivos por usuario no bucket;
 * - evita colisoes mesmo com nomes repetidos;
 * - mantem o nome original legivel para o usuario.
 */

export function sanitizeFileName(name: string): string {
  const base = path.basename(name);
  // Remove acentos para que o nome continue legivel em qualquer bucket.
  const normalized = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = normalized.replace(/[^\w.\- ]+/g, "_").trim();
  const withoutSpaces = cleaned.replace(/\s+/g, "-");
  return (withoutSpaces || "arquivo").slice(0, 120);
}

export function buildStorageKey(userId: string, fileName: string, now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${userId}/${year}/${month}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function buildImportStorageKey(userId: string, source: string, fileName: string): string {
  const safeSource = sanitizeFileName(source).replace(/\./g, "-").slice(0, 40);
  const now = new Date();
  return `${userId}/imports/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${safeSource}-${randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function isKeyOwnedBy(key: string, userId: string): boolean {
  return key.startsWith(`${userId}/`);
}
