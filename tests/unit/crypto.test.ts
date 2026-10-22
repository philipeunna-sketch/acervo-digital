import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  signPayload,
  verifyPassword,
  verifySignedPayload,
} from "@/lib/security/crypto";

describe("criptografia e senhas", () => {
  it("gera hash de senha verificavel e nao reversivel", async () => {
    const hash = await hashPassword("Senha#Forte123");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("Senha#Forte123");
    await expect(verifyPassword("Senha#Forte123", hash)).resolves.toBe(true);
    await expect(verifyPassword("senha errada", hash)).resolves.toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (salt aleatorio)", async () => {
    const a = await hashPassword("MesmaSenha#1");
    const b = await hashPassword("MesmaSenha#1");
    expect(a).not.toBe(b);
  });

  it("cifra e decifra segredos de integracao", () => {
    const secret = "token-super-secreto";
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("devolve vazio para payload adulterado", () => {
    expect(decryptSecret("v1:abc:def:ghi")).toBe("");
    expect(decryptSecret(null)).toBe("");
    expect(decryptSecret("")).toBe("");
  });

  it("assina e valida payloads (anti-CSRF)", () => {
    const secret = "segredo-de-teste";
    const token = signPayload("estado-123", secret);
    expect(verifySignedPayload(token, secret)).toBe("estado-123");
    expect(verifySignedPayload(token, "outro-segredo")).toBeNull();
    expect(verifySignedPayload("sem-assinatura", secret)).toBeNull();
  });
});
