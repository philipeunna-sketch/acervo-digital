"use client";

import * as React from "react";
import { toast } from "sonner";

/**
 * Gerenciador de uploads em tempo real.
 *
 * O arquivo vai do navegador direto para o storage (PUT assinado ou multipart
 * com URLs assinadas por parte). O progresso reflete os **bytes efetivamente
 * enviados**, medidos pelos eventos de progresso do XHR.
 *
 * A fila vive em um contexto React montado no layout da aplicacao: navegar
 * entre paginas nao interrompe os uploads. O estado tambem e espelhado no
 * localStorage para que a interface possa ser restaurada apos um recarregamento.
 */

export type UploadItemStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "paused"
  | "completing"
  | "completed"
  | "failed"
  | "canceled";

export interface UploadItem {
  id: string;
  fileName: string;
  size: number;
  mimeType: string;
  uploadedBytes: number;
  status: UploadItemStatus;
  speed: number;
  etaSeconds: number | null;
  error: string | null;
  sessionId: string | null;
  albumId: string | null;
  providerId: string | null;
  startedAt: number;
  finishedAt: number | null;
}

interface UploadOptions {
  albumId?: string | null;
  providerId?: string | null;
  tags?: string[];
}

interface UploadContextValue {
  items: UploadItem[];
  activeCount: number;
  enqueue: (files: File[], options?: UploadOptions) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
}

const UploadContext = React.createContext<UploadContextValue | null>(null);

const STORAGE_KEY = "acervo-upload-queue";
const CONCURRENCY = 3;

function loadPersisted(): UploadItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UploadItem[];
    // Uploads interrompidos pelo recarregamento ficam pausados para retomada.
    return parsed.map((item) =>
      item.status === "uploading" || item.status === "preparing" || item.status === "completing"
        ? { ...item, status: "paused", error: "Envio interrompido pelo recarregamento da pagina." }
        : item,
    );
  } catch {
    return [];
  }
}

export function UploadProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const filesRef = React.useRef<Map<string, File>>(new Map());
  const abortRef = React.useRef<Map<string, XMLHttpRequest>>(new Map());
  const timersRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    setItems(loadPersisted());
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Armazenamento cheio/indisponivel: seguimos apenas com o estado em memoria.
    }
  }, [items]);

  const update = React.useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const trackSpeed = React.useCallback(
    (id: string, uploadedBytes: number) => {
      setItems((current) =>
        current.map((item) => {
          if (item.id !== id) return item;
          const now = Date.now();
          const elapsed = Math.max(0.001, (now - item.startedAt) / 1000);
          const speed = uploadedBytes / elapsed;
          const remaining = Math.max(0, item.size - uploadedBytes);
          return {
            ...item,
            uploadedBytes,
            speed,
            etaSeconds: speed > 0 ? Math.round(remaining / speed) : null,
          };
        }),
      );
    },
    [],
  );

  const remove = React.useCallback((id: string) => {
    abortRef.current.get(id)?.abort();
    abortRef.current.delete(id);
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
    filesRef.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const cancel = React.useCallback(
    (id: string) => {
      const item = items.find((entry) => entry.id === id);
      abortRef.current.get(id)?.abort();
      abortRef.current.delete(id);
      const timer = timersRef.current.get(id);
      if (timer) window.clearTimeout(timer);
      timersRef.current.delete(id);
      update(id, { status: "canceled", error: "Upload cancelado.", etaSeconds: null, speed: 0 });

      if (item?.sessionId) {
        void fetch(`/api/uploads/${item.sessionId}`, { method: "DELETE" }).catch(() => undefined);
      }
    },
    [items, update],
  );

  const runUpload = React.useCallback(
    async (id: string, file: File, options: UploadOptions) => {
      update(id, { status: "preparing", error: null, startedAt: Date.now(), uploadedBytes: 0, speed: 0 });

      try {
        const initiateResponse = await fetch("/api/uploads/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            albumId: options.albumId ?? null,
            providerId: options.providerId ?? null,
          }),
        });

        const initiatePayload = (await initiateResponse.json()) as {
          sessionId?: string;
          mode?: "single" | "multipart";
          url?: string | null;
          headers?: Record<string, string>;
          partSize?: number | null;
          partCount?: number;
          maxPartsPerBatch?: number;
          error?: string;
        };

        if (!initiateResponse.ok || !initiatePayload.sessionId) {
          throw new Error(initiatePayload.error ?? "Falha ao preparar o upload.");
        }

        const sessionId = initiatePayload.sessionId;
        update(id, { sessionId, status: "uploading" });

        const parts: Array<{ partNumber: number; etag: string; size: number }> = [];
        let uploaded = 0;

        const putWithProgress = (
          url: string,
          blob: Blob,
          headers: Record<string, string>,
          partNumber: number,
          onBytes: (loaded: number) => void,
        ): Promise<string> =>
          new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            abortRef.current.set(id, xhr);
            xhr.open("PUT", url, true);
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            for (const [key, value] of Object.entries(headers)) {
              if (key.toLowerCase() === "content-type") continue;
              xhr.setRequestHeader(key, value);
            }
            xhr.upload.onprogress = (event) => {
              if (!event.lengthComputable) return;
              onBytes(event.loaded);
            };
            xhr.onload = () => {
              abortRef.current.delete(id);
              if (xhr.status >= 200 && xhr.status < 300) {
                const etag = xhr.getResponseHeader("ETag") ?? `"part-${partNumber}-${blob.size}"`;
                resolve(etag.replaceAll('"', ""));
              } else {
                reject(new Error(`O storage respondeu HTTP ${xhr.status}.`));
              }
            };
            xhr.onerror = () => {
              abortRef.current.delete(id);
              reject(new Error("Falha de conexao durante o envio."));
            };
            xhr.onabort = () => {
              abortRef.current.delete(id);
              reject(new Error("Upload cancelado."));
            };
            xhr.send(blob);
          });

        if (initiatePayload.mode === "single") {
          const url = initiatePayload.url;
          if (!url) throw new Error("URL de upload nao informada pelo servidor.");
          const etag = await putWithProgress(
            url,
            file,
            initiatePayload.headers ?? {},
            1,
            (loaded) => {
              uploaded = loaded;
              trackSpeed(id, uploaded);
            },
          );
          parts.push({ partNumber: 1, etag, size: file.size });
          uploaded = file.size;
          trackSpeed(id, uploaded);
        } else {
          const partSize = initiatePayload.partSize ?? 16 * 1024 * 1024;
          const partCount = initiatePayload.partCount ?? 1;
          const batchSize = Math.min(initiatePayload.maxPartsPerBatch ?? 8, 16);
          const uploadedPerPart = new Map<number, number>();

          for (let batch = 0; batch < partCount; batch += batchSize) {
            const numbers = Array.from(
              { length: Math.min(batchSize, partCount - batch) },
              (_, index) => batch + index + 1,
            );

            const partsResponse = await fetch(`/api/uploads/${sessionId}/parts`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ partNumbers: numbers }),
            });
            const partsPayload = (await partsResponse.json()) as {
              urls?: Array<{ partNumber: number; url: string }>;
              error?: string;
            };
            if (!partsResponse.ok || !partsPayload.urls) {
              throw new Error(partsPayload.error ?? "Falha ao obter as URLs das partes.");
            }

            // Upload das partes em paralelo, com limite de concorrencia.
            const queue = [...partsPayload.urls];
            const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
              for (;;) {
                const item = queue.shift();
                if (!item) break;
                const start = (item.partNumber - 1) * partSize;
                const end = Math.min(file.size, start + partSize);
                const blob = file.slice(start, end);
                const etag = await putWithProgress(
                  item.url,
                  blob,
                  {},
                  item.partNumber,
                  (loaded) => {
                    uploadedPerPart.set(item.partNumber, loaded);
                    const total = Array.from(uploadedPerPart.values()).reduce((sum, value) => sum + value, 0);
                    uploaded = total;
                    trackSpeed(id, total);
                  },
                );
                parts.push({ partNumber: item.partNumber, etag, size: blob.size });
              }
            });
            await Promise.all(workers);
          }
          uploaded = file.size;
          trackSpeed(id, uploaded);
        }

        update(id, { status: "completing" });

        const completeResponse = await fetch(`/api/uploads/${sessionId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parts,
            albumId: options.albumId ?? null,
            tags: options.tags ?? [],
          }),
        });
        const completePayload = (await completeResponse.json()) as { error?: string };
        if (!completeResponse.ok) {
          throw new Error(completePayload.error ?? "O storage nao confirmou o arquivo.");
        }

        update(id, {
          status: "completed",
          uploadedBytes: file.size,
          etaSeconds: 0,
          speed: 0,
          finishedAt: Date.now(),
          error: null,
        });
        toast.success(`"${file.name}" enviado com sucesso.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha durante o envio.";
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: message === "Upload cancelado." ? "canceled" : "failed",
                  error: message,
                  etaSeconds: null,
                }
              : item,
          ),
        );
        if (message !== "Upload cancelado.") {
          toast.error(`Falha no envio de "${file.name}": ${message}`);
        }
      }
    },
    [trackSpeed, update],
  );

  const enqueue = React.useCallback(
    (files: File[], options: UploadOptions = {}) => {
      if (files.length === 0) return;
      const created: UploadItem[] = files.map((file) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        filesRef.current.set(id, file);
        return {
          id,
          fileName: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          uploadedBytes: 0,
          status: "queued" as const,
          speed: 0,
          etaSeconds: null,
          error: null,
          sessionId: null,
          albumId: options.albumId ?? null,
          providerId: options.providerId ?? null,
          startedAt: Date.now(),
          finishedAt: null,
        };
      });

      setItems((current) => [...created, ...current]);

      for (const item of created) {
        const file = filesRef.current.get(item.id);
        if (file) void runUpload(item.id, file, options);
      }
    },
    [runUpload],
  );

  const retry = React.useCallback(
    (id: string) => {
      const file = filesRef.current.get(id);
      if (!file) {
        // O File nao sobrevive ao recarregamento: sinaliza para o usuario reenviar.
        update(id, {
          status: "failed",
          error: "O arquivo nao esta mais disponivel no navegador. Selecione-o novamente para reenviar.",
        });
        return;
      }
      const item = items.find((entry) => entry.id === id);
      if (item?.sessionId) {
        void fetch(`/api/uploads/${item.sessionId}`, { method: "DELETE" }).catch(() => undefined);
      }
      void runUpload(id, file, {
        albumId: item?.albumId ?? null,
        providerId: item?.providerId ?? null,
      });
    },
    [items, runUpload, update],
  );

  const clearFinished = React.useCallback(() => {
    setItems((current) => current.filter((item) => !["completed", "canceled"].includes(item.status)));
  }, []);

  const activeCount = React.useMemo(
    () => items.filter((item) => ["queued", "preparing", "uploading", "completing"].includes(item.status)).length,
    [items],
  );

  const value = React.useMemo(
    () => ({ items, activeCount, enqueue, cancel, retry, remove, clearFinished }),
    [items, activeCount, enqueue, cancel, retry, remove, clearFinished],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploadQueue(): UploadContextValue {
  const context = React.useContext(UploadContext);
  if (!context) {
    throw new Error("useUploadQueue deve ser usado dentro de <UploadProvider>.");
  }
  return context;
}
