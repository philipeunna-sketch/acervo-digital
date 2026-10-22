"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUploadQueue } from "@/features/uploads/upload-provider";
import { toast } from "sonner";
import type { AlbumRecord } from "@/types";

export function UploadButton({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [albumId, setAlbumId] = React.useState<string>("none");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { enqueue } = useUploadQueue();

  const { data: albums } = useQuery({
    queryKey: ["albums"],
    queryFn: async (): Promise<{ albums: AlbumRecord[] }> => {
      const response = await fetch("/api/albums");
      if (!response.ok) return { albums: [] };
      return (await response.json()) as { albums: AlbumRecord[] };
    },
    staleTime: 60_000,
  });

  const send = (files: File[]): void => {
    if (files.length === 0) return;
    enqueue(files, { albumId: albumId === "none" ? null : albumId });
    toast.success(`${files.length} arquivo(s) na fila de upload.`);
    setOpen(false);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" size={compact ? "icon" : "default"} aria-label="Enviar arquivos">
        <UploadCloud aria-hidden />
        {compact ? null : <span>Enviar</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar arquivos</DialogTitle>
            <DialogDescription>
              Os arquivos sao enviados diretamente para o storage configurado. Uploads grandes usam multipart
              resumivel.
            </DialogDescription>
          </DialogHeader>

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              send(Array.from(event.dataTransfer.files));
            }}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? "border-primary bg-accent" : "border-border"
            }`}
          >
            <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm">Arraste arquivos aqui</p>
            <p className="text-xs text-muted-foreground">ou</p>
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              Selecionar arquivos
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                send(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-album">Album de destino (opcional)</Label>
            <Select value={albumId} onValueChange={setAlbumId}>
              <SelectTrigger id="upload-album">
                <SelectValue placeholder="Sem album" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem album</SelectItem>
                {(albums?.albums ?? []).map((album) => (
                  <SelectItem key={album.id} value={album.id}>
                    {album.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => router.push("/uploads")}>
              Ver uploads
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X aria-hidden /> Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
