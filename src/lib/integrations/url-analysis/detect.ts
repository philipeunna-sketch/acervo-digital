/**
 * Deteccao do tipo de origem a partir da URL.
 */

export type SourceKind =
  | "twitter"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "direct-media"
  | "webpage";

export interface SourceInfo {
  kind: SourceKind;
  host: string;
  label: string;
  /** ID do recurso quando aplicavel (id do tweet, id do video...). */
  resourceId: string | null;
  /** A midia pode ser obtida pela API oficial do servico? */
  officialApiAvailable: boolean;
  note?: string;
}

const DIRECT_MEDIA_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".mp4",
  ".mov",
  ".webm",
  ".mp3",
  ".wav",
  ".pdf",
];

export function detectSource(rawUrl: string): SourceInfo {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "webpage", host: "", label: "URL invalida", resourceId: null, officialApiAvailable: false };
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const pathLower = url.pathname.toLowerCase();

  if (host === "twitter.com" || host === "x.com" || host === "mobile.twitter.com") {
    const match = pathLower.match(/\/status\/(\d+)/);
    return {
      kind: "twitter",
      host,
      label: "X / Twitter",
      resourceId: match?.[1] ?? null,
      officialApiAvailable: Boolean(process.env.TWITTER_BEARER_TOKEN),
      note: "A API oficial do X exige credencial (TWITTER_BEARER_TOKEN). Sem ela, apenas metadados publicos sao lidos.",
    };
  }

  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
    const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : (url.searchParams.get("v") ?? pathLower.split("/").pop() ?? "");
    return {
      kind: "youtube",
      host,
      label: "YouTube",
      resourceId: id || null,
      officialApiAvailable: false,
      note: "O YouTube permite o download dos videos proprios; conteudos de terceiros sao importados apenas como imagem de capa.",
    };
  }

  if (host === "instagram.com" || host === "instagr.am") {
    return {
      kind: "instagram",
      host,
      label: "Instagram",
      resourceId: null,
      officialApiAvailable: false,
      note: "O Instagram exige API oficial autenticada para listar midias. Apenas metadados publicos sao lidos.",
    };
  }

  if (host === "tiktok.com") {
    return {
      kind: "tiktok",
      host,
      label: "TikTok",
      resourceId: null,
      officialApiAvailable: false,
      note: "O TikTok exige API oficial autenticada. Apenas metadados publicos sao lidos.",
    };
  }

  if (host === "facebook.com" || host === "fb.watch") {
    return {
      kind: "facebook",
      host,
      label: "Facebook",
      resourceId: null,
      officialApiAvailable: false,
      note: "O Facebook exige API oficial autenticada. Apenas metadados publicos sao lidos.",
    };
  }

  if (DIRECT_MEDIA_EXTENSIONS.some((ext) => pathLower.endsWith(ext))) {
    return {
      kind: "direct-media",
      host,
      label: "Arquivo direto",
      resourceId: null,
      officialApiAvailable: true,
    };
  }

  return { kind: "webpage", host, label: host, resourceId: null, officialApiAvailable: true };
}
