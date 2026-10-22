import { describe, expect, it } from "vitest";
import { buildStorageKey, isKeyOwnedBy, sanitizeFileName } from "@/lib/storage/keys";
import { formatBytes, formatDuration, formatEta, formatPercent } from "@/lib/utils/format";

describe("chaves de storage", () => {
  it("isola o usuario e gera caminho unico", () => {
    const key = buildStorageKey("user-1", "minha foto.jpeg");
    expect(key.startsWith("user-1/")).toBe(true);
    expect(key.endsWith(".jpeg")).toBe(true);
    expect(key).not.toContain(" ");
  });

  it("gera chaves distintas para nomes repetidos", () => {
    const a = buildStorageKey("user-1", "foto.png");
    const b = buildStorageKey("user-1", "foto.png");
    expect(a).not.toBe(b);
  });

  it("sanitiza nomes perigosos", () => {
    expect(sanitizeFileName("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFileName("relatório final.pdf")).toBe("relatorio-final.pdf");
  });

  it("valida a propriedade da chave", () => {
    expect(isKeyOwnedBy("user-1/2026/01/a.png", "user-1")).toBe(true);
    expect(isKeyOwnedBy("user-2/2026/01/a.png", "user-1")).toBe(false);
  });
});

describe("formatacao", () => {
  it("formata bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024 * 3)).toBe("3 MB");
  });

  it("formata duracao e eta", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3665)).toBe("1:01:05");
    expect(formatEta(45)).toBe("45s");
    expect(formatEta(null)).toBe("-");
  });

  it("formata percentual", () => {
    expect(formatPercent(42.5)).toBe("42,5%");
  });
});
