import type {
  AlbumRecord,
  FileRecord,
  ImportCandidateRecord,
  ImportJobRecord,
  Paginated,
  UploadSessionRecord,
} from "@/types";

/** Cliente HTTP da aplicacao (browser). Sempre com try/catch e erros claros. */

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Falha de conexao com o servidor.", 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Erro ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export interface LibraryQueryParams {
  q?: string;
  category?: string;
  providerId?: string;
  albumId?: string;
  from?: string;
  to?: string;
  minSize?: number;
  maxSize?: number;
  favorite?: boolean;
  processed?: "all" | "yes" | "no";
  status?: "active" | "trashed";
  extension?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface LibraryResponse extends Paginated<FileRecord> {
  providers: Array<{ id: string; name: string; kind: string; is_default: boolean }>;
}

export const filesApi = {
  list: (params: LibraryQueryParams): Promise<LibraryResponse> => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "" || value === null) continue;
      search.set(key, String(value));
    }
    return request<LibraryResponse>(`/api/files?${search.toString()}`);
  },
  get: (id: string): Promise<{ file: FileRecord; tags: Array<{ id: string; name: string }>; albumIds: string[] }> =>
    request(`/api/files/${id}`),
  update: (
    id: string,
    patch: { name?: string; description?: string | null; tags?: string[]; albumIds?: string[] },
  ): Promise<{ file: FileRecord }> =>
    request(`/api/files/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  trash: (id: string): Promise<{ ok: boolean }> => request(`/api/files/${id}`, { method: "DELETE" }),
  restore: (id: string): Promise<{ ok: boolean }> => request(`/api/files/${id}/restore`, { method: "POST" }),
  removeForever: (id: string): Promise<{ ok: boolean }> =>
    request(`/api/files/${id}/permanent?confirm=true`, { method: "DELETE" }),
  favorite: (id: string, favorite: boolean): Promise<{ favorite: boolean }> =>
    request(`/api/files/${id}/favorite`, { method: "POST", body: JSON.stringify({ favorite }) }),
  link: (id: string, download = false): Promise<{ url: string; expiresIn: number }> =>
    request(`/api/files/${id}/link?${download ? "download=1" : ""}`),
  text: (id: string): Promise<{ kind: string; text?: string; excerpt?: string; message?: string }> =>
    request(`/api/files/${id}/text`),
  bulk: (payload: {
    fileIds: string[];
    action: "trash" | "restore" | "delete" | "favorite" | "unfavorite" | "move" | "tag";
    albumId?: string;
    tags?: string[];
  }): Promise<{ ok: boolean; count: number }> => request("/api/files/bulk", { method: "POST", body: JSON.stringify(payload) }),
};

export const albumsApi = {
  list: (): Promise<{ albums: AlbumRecord[] }> => request("/api/albums"),
  create: (payload: { name: string; description?: string | null }): Promise<{ album: AlbumRecord }> =>
    request("/api/albums", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: { name?: string; description?: string | null; coverFileId?: string | null }): Promise<{ album: AlbumRecord }> =>
    request(`/api/albums/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  remove: (id: string, deleteFiles = false): Promise<{ ok: boolean }> =>
    request(`/api/albums/${id}?deleteFiles=${deleteFiles ? "true" : "false"}`, { method: "DELETE" }),
  files: (id: string): Promise<{ items: FileRecord[]; total: number }> => request(`/api/albums/${id}/files`),
  addFiles: (id: string, fileIds: string[]): Promise<{ added: number }> =>
    request(`/api/albums/${id}/files`, { method: "POST", body: JSON.stringify({ fileIds }) }),
  removeFiles: (id: string, fileIds: string[]): Promise<{ removed: number }> =>
    request(`/api/albums/${id}/files`, { method: "DELETE", body: JSON.stringify({ fileIds }) }),
};

export const uploadsApi = {
  list: (): Promise<{ sessions: UploadSessionRecord[] }> => request("/api/uploads"),
  cancel: (id: string): Promise<{ ok: boolean }> => request(`/api/uploads/${id}`, { method: "DELETE" }),
};

export const importsApi = {
  search: (query: string): Promise<{ provider: string; results: Array<Record<string, unknown>> }> =>
    request("/api/imports/search", { method: "POST", body: JSON.stringify({ query }) }),
  analyze: (url: string): Promise<{
    job: ImportJobRecord;
    candidates: ImportCandidateRecord[];
    page: { title: string | null; description: string | null; thumbnail: string | null };
    source: { label: string; kind: string; note?: string };
    notes: string[];
    usedAi: boolean;
    aiModel: string | null;
  }> => request("/api/imports/analyze", { method: "POST", body: JSON.stringify({ url }) }),
  commit: (payload: {
    jobId: string;
    candidateIds: string[];
    providerId?: string | null;
    albumId?: string | null;
  }): Promise<{ ok: boolean; jobId: string }> =>
    request("/api/imports/commit", { method: "POST", body: JSON.stringify(payload) }),
  job: (id: string): Promise<{ job: ImportJobRecord; candidates: ImportCandidateRecord[] }> =>
    request(`/api/imports/jobs/${id}`),
};

export const integrationsApi = {
  status: (): Promise<Record<string, unknown>> => request("/api/integrations"),
};

export const searchApi = {
  global: (term: string): Promise<{ files: FileRecord[]; albums: AlbumRecord[] }> =>
    request(`/api/search?q=${encodeURIComponent(term)}`),
};
