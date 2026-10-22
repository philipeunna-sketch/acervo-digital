import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { LocalStorageProvider } from "@/lib/storage/local";
import { buildStorageKey } from "@/lib/storage/keys";
import { TEST_STORAGE_ROOT } from "../setup";

let provider: LocalStorageProvider;

beforeAll(() => {
  provider = new LocalStorageProvider({ name: "Teste", bucket: "teste", rootDir: TEST_STORAGE_ROOT });
});

afterAll(async () => {
  await rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
});

describe("driver de armazenamento local", () => {
  it("grava e recupera um objeto", async () => {
    const key = buildStorageKey("user-1", "nota.txt");
    const meta = await provider.putObject({
      key,
      body: new TextEncoder().encode("conteudo do arquivo"),
      contentType: "text/plain",
      contentLength: 19,
    });

    expect(meta.size).toBe(19);
    const head = await provider.headObject(key);
    expect(head?.size).toBe(19);
  });

  it("devolve null para objeto inexistente", async () => {
    expect(await provider.headObject("user-1/nao-existe.txt")).toBeNull();
  });

  it("gera URL assinada que valida expiracao e assinatura", async () => {
    const key = buildStorageKey("user-1", "segredo.txt");
    await provider.putObject({ key, body: new Uint8Array([1, 2, 3]) });

    const url = new URL(await provider.signDownload({ key, expiresIn: 600, filename: "segredo.txt" }), "http://localhost");
    const expires = Number(url.searchParams.get("expires"));
    const signature = url.searchParams.get("signature") ?? "";
    const filename = url.searchParams.get("filename") ?? "";

    expect(provider.verifySignature(`${key}|${expires}|${filename}`, signature)).toBe(true);
    expect(provider.verifySignature(`${key}|${expires}|outro-arquivo`, signature)).toBe(false);
    expect(expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("faz multipart upload concatenando as partes na ordem", async () => {
    const key = buildStorageKey("user-2", "grande.bin");
    const multipart = await provider.createMultipartUpload({ key, contentType: "application/octet-stream" });

    await provider.writePart(multipart.uploadId, 1, new Uint8Array([1, 2, 3]));
    await provider.writePart(multipart.uploadId, 2, new Uint8Array([4, 5]));

    const meta = await provider.completeMultipartUpload({
      key,
      uploadId: multipart.uploadId,
      parts: [
        { partNumber: 1, etag: "a", size: 3 },
        { partNumber: 2, etag: "b", size: 2 },
      ],
    });

    expect(meta.size).toBe(5);
    const head = await provider.headObject(key);
    expect(head?.size).toBe(5);
  });

  it("permite abortar multipart e listar objetos", async () => {
    const key = buildStorageKey("user-3", "descartado.bin");
    const multipart = await provider.createMultipartUpload({ key });
    await provider.writePart(multipart.uploadId, 1, new Uint8Array([1]));
    await provider.abortMultipartUpload({ key, uploadId: multipart.uploadId });

    expect(await provider.headObject(key)).toBeNull();
    const objects = await provider.listObjects("user-3/");
    expect(objects.every((object) => object.key.startsWith("user-3/"))).toBe(true);
  });

  it("copia e remove objetos", async () => {
    const source = buildStorageKey("user-4", "origem.txt");
    const destination = buildStorageKey("user-4", "destino.txt");
    await provider.putObject({ key: source, body: new Uint8Array([1, 2, 3, 4]) });

    const copy = await provider.copyObject(source, destination);
    expect(copy.size).toBe(4);

    await provider.deleteObject(destination);
    expect(await provider.headObject(destination)).toBeNull();
  });
});
