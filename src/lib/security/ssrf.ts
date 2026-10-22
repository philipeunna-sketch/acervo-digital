import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Protecao contra SSRF (Server-Side Request Forgery).
 *
 * Regras aplicadas:
 *  - apenas http/https;
 *  - sem credenciais embutidas na URL;
 *  - portas permitidas em allowlist;
 *  - resolucao DNS e bloqueio de IPs privados, loopback, link-local,
 *    metadata de nuvem (169.254.169.254) e faixas reservadas;
 *  - cada redirect e revalidado antes de ser seguido;
 *  - limite de tamanho da resposta e timeout.
 */

export class SsrfError extends Error {
  readonly code = "SSRF_BLOCKED";
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const DEFAULT_ALLOWED_PORTS = new Set([80, 443]);
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
  "169.254.169.254",
]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function allowedPorts(): Set<number> {
  const extra = process.env.FETCH_ALLOWED_PORTS;
  const ports = new Set(DEFAULT_ALLOWED_PORTS);
  if (extra) {
    for (const item of extra.split(",")) {
      const value = Number(item.trim());
      if (Number.isInteger(value) && value > 0 && value < 65536) ports.add(value);
    }
  }
  return ports;
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function inCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const ipNum = ipv4ToNumber(ip);
  const rangeNum = ipv4ToNumber(range ?? "");
  if (ipNum === null || rangeNum === null || !Number.isInteger(bits)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNum & mask) === (rangeNum & mask);
}

const BLOCKED_IPV4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

/** Retorna `true` quando o IP pertence a uma faixa nao publicamente roteavel. */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return BLOCKED_IPV4_CIDRS.some((cidr) => inCidr(ip, cidr));
  }
  if (version === 6) {
    const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("ff")) return true;
    if (normalized.startsWith("2001:db8")) return true;
    // IPv4 mapeado (::ffff:1.2.3.4) - valida o IPv4 embutido
    const mapped = normalized.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped && mapped[1]) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Validacao estatica (sem DNS) da URL. */
export function assertSafeUrlShape(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("URL invalida");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfError(`Esquema de URL nao permitido: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SsrfError("URLs com credenciais nao sao permitidas");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new SsrfError(`Host bloqueado: ${url.hostname}`);
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!allowedPorts().has(port)) {
    throw new SsrfError(`Porta nao permitida: ${port}`);
  }
  return url;
}

/** Resolve o host e garante que todos os IPs obtidos sao publicos. */
export async function assertResolvedAddressIsPublic(hostname: string): Promise<void> {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new SsrfError(`Endereco IP bloqueado: ${hostname}`);
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfError(`Falha ao resolver o host: ${hostname}`);
  }
  if (addresses.length === 0) throw new SsrfError(`Host sem endereco resolvivel: ${hostname}`);
  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      throw new SsrfError(`Host resolve para endereco privado (${entry.address})`);
    }
  }
}

export interface SafeFetchOptions extends RequestInit {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * `fetch` seguro: revalida hostname/IP a cada redirect e nunca segue para
 * destino nao publico.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = 3, timeoutMs = 15000, maxBytes = 25 * 1024 * 1024, ...init } = options;
  let current = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const url = assertSafeUrlShape(current);
    await assertResolvedAddressIsPublic(url.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        redirect: "manual",
        signal: init.signal ?? controller.signal,
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, url).toString();
        current = next; // revalidado na proxima iteracao
        continue;
      }
      if (maxBytes && response.ok) {
        const length = response.headers.get("content-length");
        if (length && Number(length) > maxBytes) {
          throw new SsrfError("Conteudo excede o tamanho maximo permitido");
        }
      }
      return response;
    } catch (error) {
      if (error instanceof SsrfError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SsrfError("Tempo limite excedido ao buscar o recurso");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new SsrfError("Numero maximo de redirects excedido");
}

/**
 * Baixa o corpo respeitando o limite de tamanho, mesmo quando o servidor
 * nao informa `content-length`.
 */
export async function readLimitedBody(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > maxBytes) {
    throw new SsrfError("Conteudo excede o tamanho maximo permitido");
  }
  if (!response.body) return new ArrayBuffer(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SsrfError("Conteudo excede o tamanho maximo permitido");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
