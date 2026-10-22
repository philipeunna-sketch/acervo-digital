import type { RawMediaCandidate } from "@/lib/integrations/ai/analyze";

/**
 * Extracao de metadados e midias a partir do HTML publico de uma pagina.
 *
 * Usa apenas informacoes ja publicadas pela pagina (Open Graph, Twitter Card,
 * JSON-LD e tags <img>/<video>). Nao contorna autenticacao, paywalls ou
 * protecoes tecnicas.
 */

export interface PageMetadata {
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
  video: string | null;
  publishedDate: string | null;
  canonicalUrl: string | null;
  type: string | null;
}

export interface ExtractedPage {
  metadata: PageMetadata;
  candidates: RawMediaCandidate[];
}

function metaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]).trim();
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)));
}

function absoluteUrl(candidate: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(candidate, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

export function extractMetadata(html: string, baseUrl: string): PageMetadata {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);

  return {
    title: decodeEntities(titleMatch?.[1] ?? metaContent(html, "og:title") ?? "").trim() || null,
    description:
      decodeEntities(
        metaContent(html, "og:description") ?? metaContent(html, "description") ?? metaContent(html, "twitter:description") ?? "",
      ).trim() || null,
    siteName: metaContent(html, "og:site_name"),
    image: metaContent(html, "og:image") ? absoluteUrl(metaContent(html, "og:image")!, baseUrl) : null,
    video: metaContent(html, "og:video") ? absoluteUrl(metaContent(html, "og:video")!, baseUrl) : null,
    publishedDate:
      metaContent(html, "article:published_time") ??
      metaContent(html, "og:published_time") ??
      metaContent(html, "datePublished"),
    canonicalUrl: canonicalMatch?.[1] ? absoluteUrl(canonicalMatch[1], baseUrl) : null,
    type: metaContent(html, "og:type"),
  };
}

interface JsonLdEntity {
  "@type"?: string | string[];
  contentUrl?: string;
  thumbnailUrl?: string | string[];
  embedUrl?: string;
  name?: string;
  description?: string;
  uploadDate?: string;
  duration?: string;
  width?: number | string;
  height?: number | string;
}

function collectJsonLd(html: string): JsonLdEntity[] {
  const entities: JsonLdEntity[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]?.trim() ?? "null") as unknown;
      const queue: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      while (queue.length > 0) {
        const item = queue.shift();
        if (Array.isArray(item)) {
          queue.push(...item);
        } else if (item && typeof item === "object") {
          const obj = item as JsonLdEntity & { "@graph"?: unknown };
          entities.push(obj);
          if (obj["@graph"]) queue.push(obj["@graph"]);
        }
      }
    } catch {
      // JSON-LD invalido: ignora
    }
  }
  return entities;
}

function mediaTypeFromJsonLd(types: string | string[] | undefined): RawMediaCandidate["mediaType"] {
  const list = Array.isArray(types) ? types : types ? [types] : [];
  const joined = list.join(" ").toLowerCase();
  if (joined.includes("video")) return "video";
  if (joined.includes("image") || joined.includes("photo")) return "image";
  if (joined.includes("audio")) return "audio";
  if (joined.includes("article") || joined.includes("document")) return "document";
  return "unknown";
}

export function extractCandidates(
  html: string,
  baseUrl: string,
  metadata: PageMetadata,
): RawMediaCandidate[] {
  const candidates: RawMediaCandidate[] = [];
  const seen = new Set<string>();

  const add = (candidate: RawMediaCandidate): void => {
    const key = candidate.downloadUrl ?? candidate.sourceUrl;
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  // 1) JSON-LD (VideoObject, ImageObject, Article...)
  for (const entity of collectJsonLd(html)) {
    const mediaType = mediaTypeFromJsonLd(entity["@type"]);
    const urls = [entity.contentUrl, entity.embedUrl].filter((u): u is string => Boolean(u));
    for (const url of urls) {
      const absolute = absoluteUrl(url, baseUrl);
      if (!absolute) continue;
      const thumbnails = Array.isArray(entity.thumbnailUrl)
        ? entity.thumbnailUrl
        : entity.thumbnailUrl
          ? [entity.thumbnailUrl]
          : [];
      add({
        mediaType: mediaType === "unknown" ? "video" : mediaType,
        sourceUrl: absolute,
        downloadUrl: absolute,
        thumbnailUrl: thumbnails[0] ? absoluteUrl(thumbnails[0], baseUrl) : null,
        title: entity.name ?? metadata.title,
        description: entity.description ?? metadata.description,
        mimeType: null,
        sizeBytes: null,
        width: typeof entity.width === "number" ? entity.width : null,
        height: typeof entity.height === "number" ? entity.height : null,
        durationSeconds: entity.duration ? parseInt(entity.duration, 10) : null,
      });
    }
  }

  // 2) Open Graph / Twitter Card
  if (metadata.video) {
    add({
      mediaType: "video",
      sourceUrl: metadata.video,
      downloadUrl: metadata.video,
      thumbnailUrl: metadata.image,
      title: metadata.title,
      description: metadata.description,
      mimeType: null,
      sizeBytes: null,
      width: null,
      height: null,
      durationSeconds: null,
    });
  }
  if (metadata.image) {
    add({
      mediaType: "image",
      sourceUrl: metadata.image,
      downloadUrl: metadata.image,
      thumbnailUrl: metadata.image,
      title: metadata.title,
      description: metadata.description,
      mimeType: null,
      sizeBytes: null,
      width: null,
      height: null,
      durationSeconds: null,
    });
  }

  // 3) Tags <video>/<source>/<img> (limitadas para nao varrer paginas gigantes)
  const mediaPattern = /<(video|source|img)[^>]+(?:src|data-src|content)=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = mediaPattern.exec(html)) !== null && count < 24) {
    const tag = match[1]!.toLowerCase();
    const raw = match[2]!;
    if (raw.startsWith("data:")) continue;
    const absolute = absoluteUrl(raw, baseUrl);
    if (!absolute) continue;
    count += 1;
    add({
      mediaType: tag === "img" ? "image" : "video",
      sourceUrl: absolute,
      downloadUrl: absolute,
      thumbnailUrl: tag === "img" ? absolute : metadata.image,
      title: metadata.title,
      description: metadata.description,
      mimeType: null,
      sizeBytes: null,
      width: null,
      height: null,
      durationSeconds: null,
    });
  }

  return candidates;
}

export function parsePage(html: string, baseUrl: string): ExtractedPage {
  const metadata = extractMetadata(html, baseUrl);
  return { metadata, candidates: extractCandidates(html, baseUrl, metadata) };
}
