import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { getLocalStorageSecret } from "@/lib/env";
import type {
  MultipartUploadHandle,
  ObjectMeta,
  PutObjectParams,
  SignedUrlParams,
  StorageProvider,
  StorageUsage,
  UploadedPart,
} from "@/lib/storage/types";

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { getReader?: unknown }).getReader === "function"
  );
}

/**
 * Driver de armazenamento em disco - EXCLUSIVO para desenvolvimento local.
 *
 * Reproduz o comportamento de um bucket privado: os objetos nao sao servidos
 * estaticamente; cada acesso exige uma URL assinada com expiracao, validada
 * pela rota `/api/storage/local`. Em producao utilize o driver S3/Wasabi.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly kind = "local" as const;
  readonly name: string;
  readonly bucket: string;
  readonly id?: string;

  private readonly root: string;

  constructor(options: { name?: string; bucket?: string; rootDir?: string; id?: string } = {}) {
    this.name = options.name ?? "Armazenamento local (dev)";
    this.bucket = options.bucket ?? "acervo-local";
    this.id = options.id;
    this.root = path.join(options.rootDir ?? path.join(process.cwd(), ".dev-storage"), this.bucket);
  }

  private resolveKey(key: string): string {
    const normalized = path.normalize(key).replace(/^([/\\])+/, "");
    const full = path.join(this.root, normalized);
    if (!full.startsWith(this.root)) throw new Error("Chave de storage invalida.");
    return full;
  }

  /** Caminho absoluto seguro para leitura (usado pelas rotas de dev). */
  resolveKeyForRead(key: string): string {
    return this.resolveKey(key);
  }

  private sign(payload: string): string {
    return createHmac("sha256", getLocalStorageSecret()).update(payload).digest("base64url");
  }

  /** Exposto para uso pela rota de download local. */
  verifySignature(payload: string, signature: string): boolean {
    const expected = this.sign(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async putObject(params: PutObjectParams): Promise<ObjectMeta> {
    const target = this.resolveKey(params.key);
    await mkdir(path.dirname(target), { recursive: true });
    const body = params.body;

    if (body instanceof Uint8Array) {
      await writeFile(target, body);
    } else if (isReadableStream(body)) {
      const chunks: Buffer[] = [];
      const reader = body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(Buffer.from(value));
      }
      await writeFile(target, Buffer.concat(chunks));
    } else {
      await writeFile(target, Buffer.from(body));
    }
    const info = await stat(target);
    return {
      key: params.key,
      size: info.size,
      contentType: params.contentType,
      lastModified: info.mtime,
    };
  }

  async signUploadObject(params: {
    key: string;
    contentType?: string;
    expiresIn?: number;
  }): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + Math.max(300, params.expiresIn ?? 3600);
    const payload = `${params.key}|${expires}|upload`;
    const signature = this.sign(payload);
    const query = new URLSearchParams({ key: params.key, expires: String(expires), signature });
    return `/api/storage/local/upload?${query.toString()}`;
  }

  async createMultipartUpload(params: Omit<PutObjectParams, "body">): Promise<MultipartUploadHandle> {
    const uploadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const dir = path.join(this.root, ".multipart", uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "meta.json"),
      JSON.stringify({ key: params.key, contentType: params.contentType, createdAt: new Date().toISOString() }),
    );
    return { uploadId, key: params.key, partSize: params.contentLength ?? 0 };
  }

  async signUploadPart(params: { key: string; uploadId: string; partNumber: number }): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const payload = `${params.key}|${params.uploadId}|${params.partNumber}|${expires}`;
    const signature = this.sign(payload);
    const query = new URLSearchParams({
      key: params.key,
      uploadId: params.uploadId,
      partNumber: String(params.partNumber),
      expires: String(expires),
      signature,
    });
    return `/api/storage/local/part?${query.toString()}`;
  }

  async completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: UploadedPart[];
  }): Promise<ObjectMeta> {
    const dir = path.join(this.root, ".multipart", params.uploadId);
    const target = this.resolveKey(params.key);
    await mkdir(path.dirname(target), { recursive: true });
    const ordered = params.parts.slice().sort((a, b) => a.partNumber - b.partNumber);
    const chunks: Buffer[] = [];
    for (const part of ordered) {
      const partPath = path.join(dir, `part-${String(part.partNumber).padStart(5, "0")}`);
      const data = await readFile(partPath);
      chunks.push(data);
    }
    await writeFile(target, Buffer.concat(chunks));
    await rm(dir, { recursive: true, force: true });
    const info = await stat(target);
    return { key: params.key, size: info.size, lastModified: info.mtime };
  }

  async abortMultipartUpload(params: { key: string; uploadId: string }): Promise<void> {
    const dir = path.join(this.root, ".multipart", params.uploadId);
    await rm(dir, { recursive: true, force: true });
  }

  async signDownload(params: SignedUrlParams): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + Math.max(60, params.expiresIn);
    const payload = `${params.key}|${expires}|${params.filename ?? ""}`;
    const signature = this.sign(payload);
    const query = new URLSearchParams({
      key: params.key,
      expires: String(expires),
      signature,
    });
    if (params.filename) query.set("filename", params.filename);
    if (params.download) query.set("download", "1");
    return `/api/storage/local/object?${query.toString()}`;
  }

  async headObject(key: string): Promise<ObjectMeta | null> {
    try {
      const info = await stat(this.resolveKey(key));
      if (!info.isFile()) return null;
      return { key, size: info.size, lastModified: info.mtime };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async listObjects(prefix = ""): Promise<ObjectMeta[]> {
    const objects: ObjectMeta[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === ".multipart") continue;
          await walk(full);
        } else {
          const info = await stat(full);
          const key = path.relative(this.root, full).split(path.sep).join("/");
          if (key.startsWith(prefix)) {
            objects.push({ key, size: info.size, lastModified: info.mtime });
          }
        }
      }
    };
    await walk(this.root);
    return objects;
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<ObjectMeta> {
    const source = this.resolveKey(sourceKey);
    const destination = this.resolveKey(destinationKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    const info = await stat(destination);
    return { key: destinationKey, size: info.size, lastModified: info.mtime };
  }

  async usage(): Promise<StorageUsage> {
    const objects = await this.listObjects();
    const usedBytes = objects.reduce((sum, obj) => sum + obj.size, 0);
    return { usedBytes, totalBytes: null };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await mkdir(this.root, { recursive: true });
      return { ok: true, message: `Driver local ativo em ${this.root}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Falha no driver local." };
    }
  }

  /** Stream do objeto (usado pela rota de download local). */
  createReadStream(key: string) {
    return createReadStream(this.resolveKey(key));
  }

  /** Caminho absoluto do objeto (usado para gravacao de partes multipart). */
  partPath(uploadId: string, partNumber: number): string {
    return path.join(this.root, ".multipart", uploadId, `part-${String(partNumber).padStart(5, "0")}`);
  }

  async writePart(uploadId: string, partNumber: number, data: Uint8Array): Promise<void> {
    const target = this.partPath(uploadId, partNumber);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
}
