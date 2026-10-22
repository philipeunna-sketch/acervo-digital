/* eslint-disable @next/next/no-img-element -- imagens privadas servidas por URL assinada: o proxy do next/image nao se aplica. */
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ImageOff, Star, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { FilePreviewDialog } from "@/features/files/file-preview-dialog";
import { FileActions } from "@/features/files/file-actions";
import { useUploadQueue } from "@/features/uploads/upload-provider";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDate } from "@/lib/utils/format";
import type { FileRecord } from "@/types";

export function AlbumDetail(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const albumId = String(params.id);
  const queryClient = useQueryClient();
  const { enqueue } = useUploadQueue();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [preview, setPreview] = React.useState<FileRecord | null>(null);
  const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({});
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: albumQuery, isLoading: albumsLoading } = useQuery({
    queryKey: ["albums"],
    queryFn: async () => {
      const response = await fetch("/api/albums");
      if (!response.ok)
        return {
          albums: [] as Array<{
            id: string;
            name: string;
            description: string | null;
            file_count: number;
            created_at: string;
          }>,
        };
      return (await response.json()) as {
        albums: Array<{
          id: string;
          name: string;
          description: string | null;
          file_count: number;
          created_at: string;
        }>;
      };
    },
    staleTime: 30_000,
  });

  const album = albumQuery?.albums.find((item) => item.id === albumId);

  const filesQuery = useQuery({
    queryKey: ["album-files", albumId],
    queryFn: async (): Promise<{ items: FileRecord[]; total: number }> => {
      const response = await fetch(`/api/albums/${albumId}/files`);
      if (!response.ok) return { items: [], total: 0 };
      return (await response.json()) as { items: FileRecord[]; total: number };
    },
    enabled: Boolean(albumId),
  });

  const files = React.useMemo(() => filesQuery.data?.items ?? [], [filesQuery.data?.items]);

  React.useEffect(() => {
    if (files.length === 0) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/files/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: files.map((file) => file.id) }),
        });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { links: Array<{ id: string; url: string }> };
        const map: Record<string, string> = {};
        for (const link of payload.links) map[link.id] = link.url;
        if (active) setThumbnails(map);
      } catch {
        // Miniaturas opcionais.
      }
    })();
    return () => {
      active = false;
    };
  }, [files]);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["album-files", albumId] });
    void queryClient.invalidateQueries({ queryKey: ["albums"] });
  };

  const upload = (list: FileList | null): void => {
    if (!list || list.length === 0) return;
    enqueue(Array.from(list), { albumId });
    toast.success(`${list.length} imagem(ns) na fila de upload.`);
  };

  const removeSelected = async (): Promise<void> => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      const response = await fetch(`/api/albums/${albumId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: ids }),
      });
      if (!response.ok) throw new Error("Falha ao remover do album.");
      toast.success(`${ids.length} imagem(ns) removidas do album.`);
      setSelected(new Set());
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao remover.");
    }
  };

  const setCover = async (fileId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/albums/${albumId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverFileId: fileId }),
      });
      if (!response.ok) throw new Error("Falha ao definir a capa.");
      toast.success("Capa do album atualizada.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao definir a capa.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" asChild className="mb-1">
            <Link href="/imagens">
              <ArrowLeft aria-hidden /> Albuns
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{album?.name ?? "Album"}</h1>
          {album?.description ? (
            <p className="text-sm text-muted-foreground">{album.description}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {files.length} imagem(ns) {album ? `· criado em ${formatDate(album.created_at)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <Button variant="outline" size="sm" onClick={() => void removeSelected()}>
              Remover do album
            </Button>
          ) : null}
          <Button onClick={() => inputRef.current?.click()}>
            <Upload aria-hidden /> Enviar imagens
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              upload(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      {albumsLoading ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square w-full" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Album vazio</p>
            <p className="text-sm text-muted-foreground">Envie imagens diretamente para este album.</p>
            <Button onClick={() => inputRef.current?.click()}>
              <Upload aria-hidden /> Enviar imagens
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {files.map((file) => (
            <div
              key={file.id}
              className={cn(
                "group relative overflow-hidden rounded-lg border bg-card",
                selected.has(file.id) ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => setPreview(file)}
                className="block aspect-square w-full overflow-hidden bg-muted/50"
                aria-label={`Abrir ${file.name}`}
              >
                {thumbnails[file.id] ? (
                  <img
                    src={thumbnails[file.id]}
                    alt={file.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <ImageOff className="mx-auto mt-10 h-6 w-6 text-muted-foreground" aria-hidden />
                )}
              </button>

              <div className="absolute left-2 top-2 rounded-md bg-background/80 p-1 backdrop-blur">
                <Checkbox
                  checked={selected.has(file.id)}
                  onCheckedChange={(checked) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked === true) next.add(file.id);
                      else next.delete(file.id);
                      return next;
                    })
                  }
                  aria-label={`Selecionar ${file.name}`}
                />
              </div>

              <div className="flex items-center gap-1 border-t border-border bg-card/90 p-2">
                <button
                  type="button"
                  onClick={() => void setCover(file.id)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Definir como capa"
                  title="Definir como capa"
                >
                  <Star className="h-3.5 w-3.5" aria-hidden />
                </button>
                <span className="min-w-0 flex-1 truncate text-xs" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatBytes(file.size_bytes)}</span>
                <FileActions file={file} onPreview={setPreview} onChanged={refresh} />
              </div>
            </div>
          ))}
        </div>
      