import { getEnv } from "@/lib/env";

/**
 * Camada de abstracao do provedor de IA.
 *
 * Implementa o protocolo de chat completions da OpenAI, compativel com
 * OpenAI, Groq, OpenRouter, Together, DeepSeek, Azure (endpoint proprio) e
 * Google Gemini via endpoint compativel. Trocar de provedor = trocar o
 * adaptador, sem alterar o restante da aplicacao.
 */

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /** Resposta em JSON (quando suportado pelo provedor). */
  json?: boolean;
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  complete(messages: AiMessage[], options?: AiCompletionOptions): Promise<string>;
}

export interface AiProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;
  readonly model: string;

  constructor(private readonly config: AiProviderConfig) {
    this.name = config.provider;
    this.model = config.model;
  }

  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.baseUrl && this.config.model);
  }

  async complete(messages: AiMessage[], options: AiCompletionOptions = {}): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("Provedor de IA nao configurado. Defina AI_API_KEY, AI_BASE_URL e AI_MODEL.");
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? this.config.maxTokens ?? 1500,
    };
    if (options.json) body.response_format = { type: "json_object" };

    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Provedor de IA respondeu ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Provedor de IA nao retornou conteudo.");
    return content;
  }
}

export function envAiProvider(): AiProvider | null {
  const env = getEnv();
  if (!env.AI_API_KEY || !env.AI_MODEL) return null;
  return new OpenAiCompatibleProvider({
    provider: env.AI_PROVIDER ?? "openai",
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL ?? "https://api.openai.com/v1",
    model: env.AI_MODEL,
    maxTokens: env.AI_MAX_TOKENS,
  });
}

export function buildProvider(config: AiProviderConfig): AiProvider {
  return new OpenAiCompatibleProvider(config);
}

/** Extrai um objeto JSON da resposta do modelo (tolera cercas de ```json). */
export function extractJson<T = unknown>(raw: string): T | null {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
