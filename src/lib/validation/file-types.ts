/**
 * Regras de tipo de arquivo compartilhadas entre cliente e servidor.
 * O cliente usa para filtrar o seletor de arquivos; o servidor revalida
 * sempre (nunca confiar apenas no navegador).
 */

export const CATEGORY_BY_EXTENSION: Record<string, string> = {
  txt: "document",
  md: "document",
  markdown: "document",
  pdf: "document",
  docx: "document",
  doc: "document",
  rtf: "document",
  odt: "document",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  avif: "image",
  svg: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  mp4: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
  m4v: "video",
  avi: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
};

export const MIME_BY_EXTENSION: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
};

export const DOCUMENT_EXTENSIONS = ["txt", "md", "markdown", "pdf", "docx", "rtf"] as const;
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif"] as const;
export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm"] as const;

export const TEXT_EXTRACTABLE_EXTENSIONS = ["txt", "md", "markdown", "rtf", "docx"] as const;

export function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) return "";
  return filename.slice(idx + 1).toLowerCase();
}

export function categoryOf(filenameOrExt: string): string {
  const ext = filenameOrExt.includes(".") ? extensionOf(filenameOrExt) : filenameOrExt.toLowerCase();
  return CATEGORY_BY_EXTENSION[ext] ?? "other";
}

export function mimeFor(filename: string, provided?: string): string {
  const ext = extensionOf(filename);
  const byExt = MIME_BY_EXTENSION[ext];
  if (byExt) return byExt;
  if (provided && provided !== "application/octet-stream") return provided;
  return "application/octet-stream";
}

/** Tipos aceitos para upload (upload direto pelo usuario). */
export const ALLOWED_UPLOAD_EXTENSIONS = new Set<string>([
  ...DOCUMENT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  "doc",
  "odt",
  "svg",
  "bmp",
  "tif",
  "tiff",
  "heic",
  "mkv",
  "m4v",
  "avi",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "aac",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
]);

export function isAllowedUpload(filename: string): boolean {
  const ext = extensionOf(filename);
  return ext.length > 0 && ALLOWED_UPLOAD_EXTENSIONS.has(ext);
}

/**
 * Confere se o mime type informado bate com a extensao do arquivo.
 * `application/octet-stream` e aceito como "desconhecido" (comum em alguns
 * navegadores/streaming) e o mime canónico da extensao e assumido.
 */
export function isMimeConsistent(filename: string, mime: string): boolean {
  const ext = extensionOf(filename);
  const expected = MIME_BY_EXTENSION[ext];
  if (!expected) return true;
  if (!mime || mime === "application/octet-stream") return true;
  const normalized = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === expected) return true;
  // JPEG tem variantes Rolled: image/jpg
  if (expected === "image/jpeg" && normalized === "image/jpg") return true;
  if (expected === "text/plain" && normalized === "text/markdown") return false;
  return false;
}
