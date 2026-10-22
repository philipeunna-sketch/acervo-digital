import type { RawMediaCandidate } from "@/lib/integrations/ai/analyze";

/**
 * Adaptador para a API oficial do X (Twitter) v2.
 * Requer `TWITTER_BEARER_TOKEN` (Bearer token de leitura).
 */

interface TwitterMedia {
  media_key?: string;
  type?: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  variants?: Array<{ content_type?: string; url?: string; bitrate?: number }>;
}

interface TwitterTweet {
  id?: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  attachments?: { media_keys?: string[] };
}

interface TwitterResponse {
  data?: TwitterTweet;
  includes?: { media?: TwitterMedia[]; users?: Array<{ id?: string; name?: string; username?: string }> };
}

export interface TwitterResult {
  ok: boolean;
  candidates: RawMediaCandidate[];
  title: string | null;
  description: string | null;
  author: string | null;
  publishedDate: string | null;
  note: string;
}

export async function fetchTweetMedia(tweetId: string): Promise<TwitterResult> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    return {
      ok: false,
      candidates: [],
      title: null,
      description: null,
      author: null,
      publishedDate: null,
      note: "TWITTER_BEARER_TOKEN nao configurado: a API oficial do X nao pode ser consultada.",
    };
  }

  const url =
    "https://api.twitter.com/2/tweets/" +
    encodeURIComponent(tweetId) +
    "?expansions=attachments.media_keys,author_id&tweet.fields=created_at,entities,attachments,author_id&media.fields=type,url,preview_image_url,width,height,duration_ms,variants";

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      candidates: [],
      title: null,
      description: null,
      author: null,
      publishedDate: null,
      note: `API do X respondeu ${response.status}: ${detail.slice(0, 200)}`,
    };
  }

  const payload = (await response.json()) as TwitterResponse;
  const tweet = payload.data;
  const author = payload.includes?.users?.find((user) => user.id === tweet?.author_id);

  const candidates: RawMediaCandidate[] = [];
  for (const media of payload.includes?.media ?? []) {
    if (media.type === "photo" && media.url) {
      candidates.push({
        mediaType: "image",
        sourceUrl: media.url,
        downloadUrl: media.url,
        thumbnailUrl: media.preview_image_url ?? media.url,
        title: tweet?.text ?? null,
        description: null,
        mimeType: "image/jpeg",
        sizeBytes: null,
        width: media.width ?? null,
        height: media.height ?? null,
        durationSeconds: null,
      });
    } else if (media.type === "video" || media.type === "animated_gif") {
      const mp4 = media.variants?.find((variant) => variant.content_type === "video/mp4");
      const url = mp4?.url ?? media.preview_image_url;
      if (!url) continue;
      candidates.push({
        mediaType: "video",
        sourceUrl: url,
        downloadUrl: url,
        thumbnailUrl: media.preview_image_url ?? null,
        title: tweet?.text ?? null,
        description: null,
        mimeType: mp4 ? "video/mp4" : null,
        sizeBytes: null,
        width: media.width ?? null,
        height: media.height ?? null,
        durationSeconds: media.duration_ms ? Math.round(media.duration_ms / 1000) : null,
      });
    }
  }

  return {
    ok: true,
    candidates,
    title: tweet?.text ?? null,
    description: author?.name ? `Publicacao de ${author.name} (@${author.username})` : null,
    author: author?.username ?? null,
    publishedDate: tweet?.created_at ?? null,
    note:
      candidates.length > 0
        ? "Midias obtidas pela API oficial do X."
        : "A publicacao nao possui midias anexadas.",
  };
}
