import type { RawMediaCandidate } from "@/lib/integrations/ai/analyze";

/**
 * Adaptador para o endpoint oficial oEmbed do YouTube.
 *
 * O YouTube nao permite o download de videos de terceiros; por isso o
 * modulo importa apenas a imagem de capa (thumbnail) publicada pelo proprio
 * servico, respeitando os termos de uso.
 */

export interface YouTubeResult {
  ok: boolean;
  candidates: RawMediaCandidate[];
  title: string | null;
  description: string | null;
  author: string | null;
  publishedDate: string | null;
  note: string;
}

export async function fetchYouTubeInfo(videoUrl: string): Promise<YouTubeResult> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return {
        ok: false,
        candidates: [],
        title: null,
        description: null,
        author: null,
        publishedDate: null,
        note: `oEmbed do YouTube respondeu ${response.status}.`,
      };
    }
    const payload = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    const candidates: RawMediaCandidate[] = [];
    if (payload.thumbnail_url) {
      candidates.push({
        mediaType: "image",
        sourceUrl: payload.thumbnail_url,
        downloadUrl: payload.thumbnail_url,
        thumbnailUrl: payload.thumbnail_url,
        title: payload.title ?? null,
        description: null,
        mimeType: "image/jpeg",
        sizeBytes: null,
        width: null,
        height: null,
        durationSeconds: null,
      });
    }

    return {
      ok: true,
      candidates,
      title: payload.title ?? null,
      description: payload.author_name ? `Canal: ${payload.author_name}` : null,
      author: payload.author_name ?? null,
      publishedDate: null,
      note:
        "Conteudo obtido via oEmbed oficial do YouTube. Apenas a capa e importada: o download do video nao e permitido pela plataforma.",
    };
  } catch (error) {
    return {
      ok: false,
      candidates: [],
      title: null,
      description: null,
      author: null,
      publishedDate: null,
      note: `Falha ao consultar o oEmbed: ${error instanceof Error ? error.message : "erro desconhecido"}`,
    };
  }
}
