import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth/session";
import { SsrfError } from "@/lib/security/ssrf";

/** Respostas JSON padronizadas para as Route Handlers. */

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

/**
 * Converte excecoes em respostas seguras (sem stack trace ou detalhes
 * sensiveis expostos ao cliente).
 */
export function handleError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const first = error.errors[0];
    return jsonError(first?.message ?? "Dados invalidos.", 422, {
      fields: error.errors.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  if (error instanceof UnauthorizedError) {
    return jsonError(error.message, 401);
  }
  if (error instanceof SsrfError) {
    return jsonError(`Destino bloqueado: ${error.message}`, 400);
  }
  const status = (error as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 600) {
    return jsonError(error instanceof Error ? error.message : "Erro na operacao.", status);
  }
  console.error("[api] erro nao tratado:", error);
  return jsonError("Erro interno do servidor.", 500);
}

/** Le e valida o corpo JSON de uma requisicao. */
export async function parseJsonBody<T>(
  request: Request,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new Error("Corpo da requisicao invalido.");
  }
  return schema.parse(raw);
}

export function getPagination(searchParams: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 24) || 24));
  return { page, pageSize };
}
