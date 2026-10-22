import { describe, expect, it } from "vitest";
import {
  categoryOf,
  extensionOf,
  isAllowedUpload,
  isMimeConsistent,
  mimeFor,
} from "@/lib/validation/file-types";
import { libraryQuerySchema, uploadInitiateSchema, passwordSchema } from "@/lib/validation/schemas";

describe("tipos de arquivo", () => {
  it("extrai a extensao corretamente", () => {
    expect(extensionOf("foto.JPEG")).toBe("jpeg");
    expect(extensionOf("relatorio.final.pdf")).toBe("pdf");
    expect(extensionOf("sem-extensao")).toBe("");
    expect(extensionOf("arquivo.")).toBe("");
  });

  it("classifica por categoria", () => {
    expect(categoryOf("doc.pdf")).toBe("document");
    expect(categoryOf("foto.png")).toBe("image");
    expect(categoryOf("clip.mp4")).toBe("video");
    expect(categoryOf("musica.mp3")).toBe("audio");
    expect(categoryOf("backup.zip")).toBe("archive");
    expect(categoryOf("desconhecido.xyz")).toBe("other");
  });

  it("bloqueia extensoes nao permitidas no upload", () => {
    expect(isAllowedUpload("foto.png")).toBe(true);
    expect(isAllowedUpload("video.mp4")).toBe(true);
    expect(isAllowedUpload("executavel.exe")).toBe(false);
    expect(isAllowedUpload("script.sh")).toBe(false);
  });

  it("detecta mime inconsistente com a extensao", () => {
    expect(isMimeConsistent("foto.png", "image/png")).toBe(true);
    expect(isMimeConsistent("foto.png", "application/pdf")).toBe(false);
    expect(isMimeConsistent("desconhecido.xyz", "application/octet-stream")).toBe(true);
  });

  it("usa o mime canonico da extensao", () => {
    expect(mimeFor("a.pdf")).toBe("application/pdf");
    expect(mimeFor("a.mp4")).toBe("video/mp4");
  });
});

describe("esquemas de validacao", () => {
  it("exige tamanho maximo de upload via servidor", () => {
    const result = uploadInitiateSchema.safeParse({
      fileName: "video.mp4",
      size: 1024,
      mimeType: "video/mp4",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita nome de arquivo com caminho", () => {
    const result = uploadInitiateSchema.safeParse({
      fileName: "../etc/passwd",
      size: 10,
      mimeType: "text/plain",
    });
    expect(result.success).toBe(false);
  });

  it("normaliza os filtros da biblioteca", () => {
    const result = libraryQuerySchema.safeParse({
      q: " relatorio ",
      page: "2",
      pageSize: "50",
      sort: "size_desc",
      favorite: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe("relatorio");
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(50);
    }
  });

  it("exige senha forte", () => {
    expect(passwordSchema.safeParse("fraca").success).toBe(false);
    expect(passwordSchema.safeParse("Senha#Forte123").success).toBe(true);
  });
});
