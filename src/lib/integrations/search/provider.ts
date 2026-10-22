import { getEnv } from "@/lib/env";

/**
 * Camada de abstracao do provedor de pesquisa web.
 *
 * Suporta Brave Search, Tavily, Serper e Google Programmable Search.
 * A troca de provedor nao afeta o restante da aplicacao.
 */

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  publishedDate: string | null;
  /** Dominio/site de origem. */
  source: string;
}

export interface SearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

abstract class BaseSearchProvider implements SearchProvider {
  abstract readonly name: string;
  constructor(protected readonly apiKey: string) {}
  abstract isConfigured(): boolean;
  abstract search(query: string, limit?: number): Promise<SearchResult[]>;
}

class BraveSearchProvider extends BaseSearchProvider {
  readonly name = "brave";

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${Math.min(20, limit)}`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": this.apiKey,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(`Brave Search respondeu ${response.status}.`);
    }
    const payload = (await response.json()) as {
      web?: {
        results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          age?: string;
          page_age?: string;
          thumbnail?: { src?: string };
        }>;
      };
    };
    return (payload.web?.results ?? [])
      .filter((item) => item.url)
      .slice(0, limit)
      .map((item) => ({
        title: item.title ?? item.url!,
        url: item.url!,
        description: item.description ?? "",
        thumbnail: item.thumbnail?.src ?? null,
        publishedDate: item.page_age ?? item.age ?? null,
        source: hostOf(item.url!),
      }));
  }
}

class TavilySearchProvider extends BaseSearchProvider {
  readonly name = "tavily";

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: Math.min(20, limit),
        include_images: true,
        search_depth: "basic",
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Tavily respondeu ${response.status}.`);
    }
    const payload = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
      images?: Array<{ url?: string; description?: string }>;
    };
    const images = payload.images ?? [];
    return (payload.results ?? []).slice(0, limit).map((item, index) => ({
      title: item.title ?? item.url ?? "Sem titulo",
      url: item.url ?? "",
      description: item.content ?? "",
      thumbnail: images[index]?.url ?? null,
      publishedDate: item.published_date ?? null,
      source: item.url ? hostOf(item.url) : "",
    }));
  }
}

class SerperSearchProvider extends BaseSearchProvider {
  readonly name = "serper";

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: Math.min(20, limit) }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Serper respondeu ${response.status}.`);
    }
    const payload = (await response.json()) as {
      organic?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
        date?: string;
        imageUrl?: string;
      }>;
    };
    return (payload.organic ?? [])
      .filter((item) => item.link)
      .slice(0, limit)
      .map((item) => ({
        title: item.title ?? item.link!,
        url: item.link!,
        description: item.snippet ?? "",
        thumbnail: item.imageUrl ?? null,
        publishedDate: item.date ?? null,
        source: hostOf(item.link!),
      }));
  }
}

class GoogleCseSearchProvider extends BaseSearchProvider {
  readonly name = "google";
  private readonly cx: string;

  constructor(apiKey: string, cx: string) {
    super(apiKey);
    this.cx = cx;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.cx);
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(this.apiKey)}&cx=${encodeURIComponent(this.cx)}&num=${Math.min(20, limit)}&q=${encodeURIComponent(query)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Google CSE respondeu ${response.status}.`);
    }
    const payload = (await response.json()) as {
      items?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
        pagemap?: { cse_image?: Array<{ src?: string }> };
      }>;
    };
    return (payload.items ?? [])
      .filter((item) => item.link)
      .slice(0, limit)
      .map((item) => ({
        title: item.title ?? item.link!,
        url: item.link!,
        description: item.snippet ?? "",
        thumbnail: item.pagemap?.cse_image?.[0]?.src ?? null,
        publishedDate: null,
        source: hostOf(item.link!),
      }));
  }
}

export function createSearchProvider(provider: string, apiKey: string, extra?: string): SearchProvider | null {
  switch (provider) {
    case "brave":
      return apiKey ? new BraveSearchProvider(apiKey) : null;
    case "tavily":
      return apiKey ? new TavilySearchProvider(apiKey) : null;
    case "serper":
      return apiKey ? new SerperSearchProvider(apiKey) : null;
    case "google":
      return apiKey && extra ? new GoogleCseSearchProvider(apiKey, extra) : null;
    default:
      return null;
  }
}

export function envSearchProvider(): SearchProvider | null {
  const env = getEnv();
  switch (env.SEARCH_PROVIDER) {
    case "tavily":
      return createSearchProvider("tavily", env.TAVILY_API_KEY ?? "");
    case "serper":
      return createSearchProvider("serper", env.SERPER_API_KEY ?? "");
    case "google":
      return createSearchProvider("google", env.GOOGLE_CSE_API_KEY ?? "", env.GOOGLE_CSE_ID ?? "");
    case "brave":
    default:
      return createSearchProvider("brave", env.BRAVE_SEARCH_API_KEY ?? "");
  }
}

/** Provedores disponiveis (para a tela de integracoes). */
export function availableSearchProviders(): Array<{ id: string; label: string; configured: boolean }> {
  const env = getEnv();
  return [
    { id: "brave", label: "Brave Search", configured: Boolean(env.BRAVE_SEARCH_API_KEY) },
    { id: "tavily", label: "Tavily", configured: Boolean(env.TAVILY_API_KEY) },
    { id: "serper", label: "Serper", configured: Boolean(env.SERPER_API_KEY) },
    { id: "google", label: "Google Programmable Search", configured: Boolean(env.GOOGLE_CSE_API_KEY && env.GOOGLE_CSE_ID) },
  ];
}
