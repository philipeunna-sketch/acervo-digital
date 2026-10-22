/**
 * Contrato de armazenamento de objetos.
 *
 * A aplicacao nunca depende de detalhes de um provedor especifico: toda a
 * logica de upload, download, migracao e exclusao passa por esta interface.
 */

export type StorageKind = "s3" | "local";

export interface PutObjectParams {
  key: string;
  body: Uint8Array | Buffer | ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface MultipartUploadHandle {
  uploadId: string;
  key: string;
  partSize: number;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size?: number;
}

export interface ObjectMeta {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  checksum?: string;
}

export interface SignedUrlParams {
  key: string;
  expiresIn: number;
  /** Nome sugerido para download. */
  filename?: string;
  contentType?: string;
  /** Forca download (Content-Disposition: attachment). */
  download?: boolean;
}

export interface StorageUsage {
  usedBytes: number;
  totalBytes: number | null;
}

export interface StorageProvider {
  readonly kind: StorageKind;
  readonly name: string;
  readonly bucket: string;
  /** Identificador do provedor (uuid no banco) quando aplicavel. */
  readonly id?: string;

  putObject(params: PutObjectParams): Promise<ObjectMeta>;
  /** URL assinada para upload direto do navegador (PUT de objeto unico). */
  signUploadObject(params: { key: string; contentType?: string; expiresIn?: number }): Promise<string>;
  createMultipartUpload(params: Omit<PutObjectParams, "body">): Promise<MultipartUploadHandle>;
  signUploadPart(params: { key: string; uploadId: string; partNumber: number }): Promise<string>;
  completeMultipartUpload(params: {
    key: string;
    uploadId: string;
    parts: UploadedPart[];
  }): Promise<ObjectMeta>;
  abortMultipartUpload(params: { key: string; uploadId: string }): Promise<void>;
  signDownload(params: SignedUrlParams): Promise<string>;
  headObject(key: string): Promise<ObjectMeta | null>;
  deleteObject(key: string): Promise<void>;
  listObjects(prefix?: string): Promise<ObjectMeta[]>;
  copyObject(sourceKey: string, destinationKey: string): Promise<ObjectMeta>;
  usage(): Promise<StorageUsage>;
  /** Verifica conectividade/credenciais. */
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}
