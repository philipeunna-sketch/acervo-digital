import {
  enrichCandidatesWithAi,
  type EnrichedCandidate,
  type RawMediaCandidate,
} from "@/lib/integrations/ai/analyze";
import type { AiProvider } from "@/lib/integrations/ai/provider";
import { detectSource, type SourceInfo } from "@/lib/integrations/url-analysis/detect";
import { parsePage } from "@/lib/integrations/url-analysis/extract";
import { fetchTweetMedia } from "@/lib/integrations/url-analysis/twitter";
import { fetchYouTubeInfo } from "@/lib/integrations/url-analysis/youtube";
import { safeFetch } from "@/lib/security/ssrf";
import { getEnv } from "@/lib/env";

/**
 * Orquestrador da analise de URL (modulo "Salvar conteudo").
 *
 * Fluxo: identificar origem -> consultar API oficial (quando existir) ou
 * ler os metadados publicos da pagina -> identificar midias -> organizar os
 * resultados com IA.
 */

export interface AnalysisResult {
  source: SourceInfo;
  page: {
    title: string | null;
    description: string | null;
    siteName: string | null;
    publishedDate: string | null;
    canonicalUrl: string | null;
    thumbnail: string | null;
  };
  candidates: EnrichedCandidate[];
  notes: string[];
  usedAi: boolean;
  aiModel: string | null;
}

function userAgent(): string {
  return getEnv().FETCH_USER_AGENT ?? "AcervoDigitalBot/1.0";
}

function extensionMime(url: string): { extension: string; mime: string } {
  const path = new URL(url).pathname.toLowerCase();
  const ext = path.split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    pdf: "application/pdf",
  };
  return { extension: ext, mime: map[ext] ?? "application/octet-stream" };
}

async function directMediaCandidate(url: string): Promise<RawMediaCandidate> {
  const { mime } = extensionMime(url);
  const mediaType: RawMediaCandidate["mediaType"] = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : "document";

  let sizeBytes: number | null = null;
  let contentType: string | null = mime;
  try {
    const response = await safeFetch(url, {
      method: "HEAD",
      timeoutMs: 12000,
      headers: { "User-Agent": userAgent() },
    });
    if (response.ok) {
      const length = response.headers.get("content-length");
      if (length) sizeBytes = Number(length);
      contentType = response.headers.get("content-type") ?? mime;
    }
  } catch {
    // Sem HEAD nao bloqueia: seguimos com o mime inferido pela extensao.
  }

  return {
    mediaType,
    sourceUrl: url,
    downloadUrl: url,
    thumbnailUrl: mediaType === "image" ? url : null,
    title: new URL(url).pathname.split("/").pop() ?? url,
    description: null,
    mimeType: contentType,
    sizeBytes,
    width: null,
    height: null,
    durationSeconds: null,
  };
}

export async function analyzeUrl(rawUrl: string, aiProvider: AiProvider | null): Promise<AnalysisResult> {
  const source = detectSource(rawUrl);
  const notes: string[] = [];
  let raw: RawMediaCandidate[] = [];
  let page: AnalysisResult["page"] = {
    title: null,
    description: null,
    siteName: source.host,
    publishedDate: null,
    canonicalUrl: rawUrl,
    thumbnail: null,
  };

  if (source.kind === "twitter" && source.resourceId) {
    const tweet = await fetchTweetMedia(source.resourceId);
    notes.push(tweet.note);
    raw = tweet.candidates;
    page = {
      ...page,
      title: tweet.title,
      description: tweet.description,
      publishedDate: tweet.publishedDate,
      thumbnail: tweet.candidates.find((c) => c.mediaType === "image")?.thumbnailUrl ?? null,
    };
  } else if (source.kind === "youtube") {
    const video = await fetchYouTubeInfo(rawUrl);
    notes.push(video.note);
    raw = video.candidates;
    page = {
      ...page,
      title: video.title,
      description: video.description,
      publishedDate: video.publishedDate,
      thumbnail: video.candidates[0]?.thumbnailUrl ?? null,
    };
  } else if (source.kind === "direct-media") {
    raw = [await directMediaCandidate(rawUrl)];
  } else {
    try {
      const response = await safeFetch(rawUrl, {
        timeoutMs: 20000,
        maxBytes: 4 * 1024 * 1024,
        headers: {
          "User-Agent": userAgent(),
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        notes.push(`A pagina respondeu HTTP ${response.status}; nenhum metadado publico pode ser lido.`);
      } else {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("html")) {
          notes.push(`O recurso nao e uma pagina HTML (${contentType}).`);
        } else {
          const html = await response.text();
          const parsed = parsePage(html, rawUrl);
          raw = parsed.candidates;
          page = {
            title: parsed.metadata.title,
            description: parsed.metadata.description,
            siteName: parsed.metadata.siteName ?? source.host,
            publishedDate: parsed.metadata.publishedDate,
            canonicalUrl: parsed.metadata.canonicalUrl ?? rawUrl,
            thumbnail: parsed.metadata.image,
          };
          notes.push("Metadados publicos extraidos da pagina (Open Graph / JSON-LD).");
        }
      }
    } catch (error) {
      notes.push(
        `Nao foi possivel ler a pagina: ${error instanceof Error ? error.message : "erro desconhecido"}`,
      );
    }
  }

  if (source.kind === "twitter" && raw.length === 0 && !source.officialApiAvailable) {
    notes.push(
      "Sem credencial da API do X, apenas metadados publicos da pagina sao lidos; as midias podem nao ser disponibilizadas.",
    );
  }

  const enriched = await enrichCandidatesWithAi(aiProvider, raw, {
    sourceUrl: rawUrl,
    pageTitle: page.title,
    pageDescription: page.description,
  });
  notes.push(...enriched.notes);

  return {
    source,
    page,
    candidates: enriched.candidates,
    notes,
    usedAi: enriched.usedAi,
    aiModel: enriched.model,
  };
}
