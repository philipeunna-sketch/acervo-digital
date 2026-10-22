import { extractJson, type AiProvider } from "@/lib/integrations/ai/provider";

/**
 * Uso de IA no modulo "Salvar conteudo".
 *
 * A IA **organiza** o que foi de fato encontrado pelas APIs/parsers. Ela nao
 * inventa midias: apenas classifica, nomeia, descreve e suggests tags.
 */

export interface RawMediaCandidate {
  mediaType: "image" | "video" | "audio" | "document" | "unknown";
  sourceUrl: string;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  description: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface EnrichedCandidate extends RawMediaCandidate {
  suggestedName: string;
  suggestedTags: string[];
  aiConfidence: number | null;
}

export interface EnrichResult {
  candidates: EnrichedCandidate[];
  usedAi: boolean;
  model: string | null;
  notes: string[];
}

const SYSTEM_PROMPT = [
  "Voce organiza midias publicas encontradas na web para um acervo digital.",
  "Responda EXCLUSIVAMENTE com JSON valido no formato:",
  '{"items":[{"index":0,"mediaType":"image|video|audio|document","name":"nome-de-arquivo.ext","description":"texto curto em portugues","tags":["tag1","tag2"],"confidence":0.0}]}',
  "Regras: use apenas os indices informados; nao invente midias; o nome deve ter no maximo 80 caracteres e extensao coerente com o tipo.",
].join("\n");

export async function enrichCandidatesWithAi(
  provider: AiProvider | null,
  raw: RawMediaCandidate[],
  context: { sourceUrl: string; pageTitle?: string | null; pageDescription?: string | null },
): Promise<EnrichResult> {
  const notes: string[] = [];
  const fallback = raw.map((candidate, index) => ({
    ...candidate,
    suggestedName: heuristicName(candidate, index),
    suggestedTags: heuristicTags(context),
    aiConfidence: null,
  }));

  if (!provider || !provider.isConfigured()) {
    notes.push("Provedor de IA nao configurado: nomes e tags foram gerados por heuristicas locais.");
    return { candidates: fallback, usedAi: false, model: null, notes };
  }

  if (raw.length === 0) {
    return { candidates: [], usedAi: false, model: null, notes: ["Nenhuma midia identificada na origem."] };
  }

  const payload = raw.map((candidate, index) => ({
    index,
    mediaType: candidate.mediaType,
    title: candidate.title,
    description: candidate.description?.slice(0, 200) ?? null,
    mimeType: candidate.mimeType,
    width: candidate.width,
    height: candidate.height,
    durationSeconds: candidate.durationSeconds,
    sourceUrl: candidate.sourceUrl,
  }));

  try {
    const rawText = await provider.complete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Pagina: ${context.sourceUrl}\nTitulo: ${context.pageTitle ?? "-"}\nDescricao: ${context.pageDescription ?? "-"}\n\nMidias encontradas:\n${JSON.stringify(payload)}`,
        },
      ],
      { json: true, temperature: 0.2 },
    );

    const parsed = extractJson<{ items?: Array<Record<string, unknown>> }>(rawText);
    const items = parsed?.items;
    if (!Array.isArray(items)) throw new Error("Resposta da IA fora do formato esperado.");

    const candidates: EnrichedCandidate[] = fallback.map((candidate, index) => {
      const item = items.find((entry) => Number(entry.index) === index);
      if (!item) return candidate;
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : candidate.suggestedName;
      const description =
        typeof item.description === "string" && item.description.trim()
          ? item.description.trim().slice(0, 400)
          : candidate.description;
      const tags = Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).slice(0, 8)
        : candidate.suggestedTags;
      const mediaType = item.mediaType;
      return {
        ...candidate,
        mediaType:
          mediaType === "image" || mediaType === "video" || mediaType === "audio" || mediaType === "document"
            ? mediaType
            : candidate.mediaType,
        description,
        suggestedName: name.slice(0, 120),
        suggestedTags: tags,
        aiConfidence:
          typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : candidate.aiConfidence,
      };
    });

    return { candidates, usedAi: true, model: provider.model, notes };
  } catch (error) {
    notes.push(
      `Falha ao consultar a IA (${error instanceof Error ? error.message : "erro desconhecido"}). Metadados mantidos por heuristica.`,
    );
    return { candidates: fallback, usedAi: false, model: null, notes };
  }
}

function heuristicName(candidate: RawMediaCandidate, index: number): string {
  const base = candidate.title?.trim() || candidate.sourceUrl.split("/").pop()?.split("?")[0] || "";
  const cleaned = base.replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  if (cleaned) return cleaned;
  const ext = candidate.mediaType === "video" ? "mp4" : candidate.mediaType === "audio" ? "mp3" : "jpg";
  return `midia-${index + 1}.${ext}`;
}

function heuristicTags(context: { pageTitle?: string | null }): string[] {
  const tags = new Set<string>();
  if (context.pageTitle) {
    for (const word of context.pageTitle.split(/\s+/).slice(0, 6)) {
      const clean = word.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
      if (clean.length > 3) tags.add(clean);
    }
  }
  return Array.from(tags).slice(0, 5);
}
