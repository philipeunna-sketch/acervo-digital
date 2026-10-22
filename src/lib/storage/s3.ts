import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  MultipartUploadHandle,
  ObjectMeta,
  PutObjectParams,
  SignedUrlParams,
  StorageProvider,
  StorageUsage,
  UploadedPart,
} from "@/lib/storage/types";

export interface S3ProviderConfig {
  name: string;
  endpoint?: string | null;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  id?: string;
}

/**
 * Adaptador para qualquer servico compativel com S3 (Wasabi, AWS S3,
 * Cloudflare R2, MinIO...). O bucket permanece privado: o acesso do
 * navegador acontece sempre por URL assinada de curta duracao.
 */
export class S3StorageProvider implements StorageProvider {
  readonly kind = "s3" as const;
  readonly name: string;
  readonly bucket: string;
  readonly id?: string;

  private readonly client: S3Client;

  constructor(private readonly config: S3ProviderConfig) {
    this.name = config.name;
    this.bucket = config.bucket;
    this.id = config.id;
    this.client = new S3Client({
      region: config.region || "us-east-1",
      endpoint: config.endpoint || undefined,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(params: PutObjectParams): Promise<ObjectMeta> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
        Metadata: params.metadata,
      }),
    );
    return {
      key: params.key,
      size: params.contentLength ?? 0,
      contentType: params.contentType,
      etag: result.ETag?.replaceAll('"', "") ?? undefined,
    };
  }

  async signUploadObject(params: {
    key: string;
    contentType?: string;
    expiresIn?: number;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        ContentType: params.contentType,
      }),
      { expiresIn: Math.max(60, params.expiresIn ?? 3600) },
    );
  }

  async createMultipartUpload(params: Omit<PutObjectParams, "body">): Promise<MultipartUploadHandle> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.key,
        ContentType: params.contentType,
        Metadata: params.metadata,
      }),
    );
    const uploadId = result.UploadId;
    if (!uploadId) throw new Error("O provedor nao retornou um UploadId para o multipart upload.");
    return { uploadId, key: params.key, partSize: params.contentLength ?? 0 };
  }

  async signUploadPart(params: { key: string; uploadId: string; partNumber: number }): Promise<string> {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        PartNumber: params.partNumber,
      }),
      { expiresIn: 60 * 60 },
    );
  }

  async completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: UploadedPart[];
  }): Promise<ObjectMeta> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        MultipartUpload: {
          Parts: params.parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    );
    const head = await this.headObject(params.key);
    return head ?? { key: params.key, size: 0 };
  }

  async abortMultipartUpload(params: { key: string; uploadId: string }): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.key,
        UploadId: params.uploadId,
      }),
    );
  }

  async signDownload(params: SignedUrlParams): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ResponseContentType: params.contentType,
      ResponseContentDisposition: params.filename
        ? `${params.download ? "attachment" : "inline"}; filename="${params.filename.replaceAll('"', "")}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn: Math.max(60, Math.min(params.expiresIn, 3600)) });
  }

  async headObject(key: string): Promise<ObjectMeta | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        key,
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
        etag: result.ETag?.replaceAll('"', "") ?? undefined,
        lastModified: result.LastModified,
        checksum: result.ChecksumSHA256,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async listObjects(prefix = ""): Promise<ObjectMeta[]> {
    const objects: ObjectMeta[] = [];
    let token: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
          MaxKeys: 1000,
        }),
      );
      for (const item of result.Contents ?? []) {
        objects.push({
          key: item.Key ?? "",
          size: item.Size ?? 0,
          lastModified: item.LastModified,
          etag: item.ETag?.replaceAll('"', "") ?? undefined,
        });
      }
      token = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<ObjectMeta> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: destinationKey,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey).replaceAll("%2F", "/")}`,
      }),
    );
    return (await this.headObject(destinationKey)) ?? { key: destinationKey, size: 0 };
  }

  async usage(): Promise<StorageUsage> {
    // S3/Wasabi nao expõem o tamanho total do bucket via API padrao.
    // O uso e calculado a partir dos metadados da aplicacao (ver dashboard).
    return { usedBytes: 0, totalBytes: null };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true, message: `Bucket "${this.bucket}" acessivel.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Falha ao acessar o bucket." };
    }
  }
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === "NotFound" || candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404;
}
