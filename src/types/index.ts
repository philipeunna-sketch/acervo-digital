/**
 * Tipos compartilhados entre servidor e cliente.
 */

export type FileCategory = "document" | "image" | "video" | "audio" | "archive" | "other";
export type FileStatus = "active" | "processing" | "trashed" | "failed";
export type StorageKind = "s3" | "local";

export interface StorageProviderRecord {
  id: string;
  name: string;
  kind: StorageKind;
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  is_default: boolean;
  is_active: boolean;
  is_system: boolean;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface FileRecord {
  id: string;
  user_id: string;
  name: string;
  original_name: string;
  extension: string | null;
  mime_type: string;
  size_bytes: number;
  category: FileCategory;
  provider_id: string | null;
  provider_kind: StorageKind;
  storage_key: string;
  external_id: string | null;
  external_url: string | null;
  checksum: string | null;
  status: FileStatus;
  source: "upload" | "import" | "drive" | "telegram";
  source_url: string | null;
  source_meta: Record<string, unknown>;
  media_meta: MediaMeta;
  text_extracted: boolean;
  excerpt: string | null;
  description: string | null;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
}

export interface MediaMeta {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  codec?: string;
  container?: string;
  pageCount?: number;
  [key: string]: unknown;
}

export interface TagRecord {
  id: string;
  name: string;
  created_at: string;
}

export interface AlbumRecord {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_file_id: string | null;
  file_count: number;
  cover_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type UploadStatus =
  | "preparing"
  | "uploading"
  | "paused"
  | "completing"
  | "completed"
  | "failed"
  | "canceled";

export interface UploadSessionRecord {
  id: string;
  user_id: string;
  file_name: string;
  size_bytes: number;
  mime_type: string;
  provider_id: string | null;
  storage_key: string;
  multipart_upload_id: string | null;
  part_size: number | null;
  status: UploadStatus;
  uploaded_bytes: number;
  parts: UploadPartMeta[];
  file_id: string | null;
  error_message: string | null;
  checksum: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface UploadPartMeta {
  partNumber: number;
  etag: string;
  size: number;
}

export type ImportJobStatus = "pending" | "running" | "completed" | "failed" | "partial";

export interface ImportJobRecord {
  id: string;
  user_id: string;
  mode: "search" | "url";
  query: string | null;
  url: string | null;
  status: ImportJobStatus;
  provider: string | null;
  ai_model: string | null;
  album_id: string | null;
  provider_id: string | null;
  stats: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export type CandidateStatus = "found" | "importing" | "imported" | "failed" | "skipped";

export interface ImportCandidateRecord {
  id: string;
  job_id: string;
  media_type: "image" | "video" | "audio" | "document" | "unknown";
  title: string | null;
  description: string | null;
  source_url: string;
  download_url: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  suggested_name: string | null;
  suggested_tags: string[];
  ai_confidence: number | null;
  selected: boolean;
  status: CandidateStatus;
  imported_file_id: string | null;
  error_message: string | null;
  created_at: string;
}

export interface IntegrationRecord {
  id: string;
  user_id: string;
  provider: "google_drive" | "telegram" | "ai" | "search";
  status: "connected" | "disconnected" | "requires_config";
  account_label: string | null;
  account_email: string | null;
  expires_at: string | null;
  scopes: string | null;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileRecord {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "user";
  avatar_url: string | null;
  must_change_password: boolean;
  quota_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface DashboardStats {
  totals: {
    files: number;
    bytes: number;
    documents: number;
    images: number;
    videos: number;
    audio: number;
    other: number;
    albums: number;
    favorites: number;
    trashed: number;
  };
  uploads: {
    active: number;
    completed: number;
    failed: number;
  };
  storage: {
    usedBytes: number;
    totalBytes: number | null;
    providerName: string;
    providerKind: StorageKind;
  };
  byType: Array<{ category: FileCategory; count: number; bytes: number }>;
  byProvider: Array<{ providerId: string | null; providerKind: StorageKind; label: string; count: number; bytes: number }>;
  recentFiles: FileRecord[];
  largestFiles: FileRecord[];
}

export interface SearchResultItem {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  category: FileCategory;
  created_at: string;
  kind: "file" | "album";
}
