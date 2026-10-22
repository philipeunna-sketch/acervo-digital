import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { getEncryptionKey } from "@/lib/env";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options?: { N?: number; r?: number; p?: number },
) => Promise<Buffer>;

/* -------------------------------------------------------------------------- */
/* Senhas (driver local de autenticacao)                                       */
/* -------------------------------------------------------------------------- */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

/** Gera hash de senha no formato `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/** Verifica a senha contra o hash armazenado (comparacao em tempo constante). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    const derived = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Segredos de integracoes (AES-256-GCM)                                       */
/* -------------------------------------------------------------------------- */

/** Cifra um segredo para persistencia. Formato: `v1:<iv>:<tag>:<cipher>` (base64url). */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

/** Decifra um segredo persistido. Retorna string vazia se o payload for invalido. */
export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return "";
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return "";
  try {
    const key = getEncryptionKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

/* -------------------------------------------------------------------------- */
/* Tokens e assinaturas                                                        */
/* -------------------------------------------------------------------------- */

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomId(): string {
  return randomUUID();
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Assina um payload (base64url) com HMAC-SHA256: `payload.signature` */
export function signPayload(payload: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** Verifica a assinatura e devolve o payload, ou `null` se invalida/forjada. */
export function verifySignedPayload(token: string, secret: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? payload : null;
}
