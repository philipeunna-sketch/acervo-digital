"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderPlus, Images, Loader2, MoreVertical, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { albumsApi } from "@/features/files/api";
import { formatDate } from "@/lib/utils/format";
import type { AlbumRecord } from "@/types";

export function AlbumsView(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState<AlbumRecord | null>(null);
  const [deleteFiles, setDeleteFiles] = React.useState(false);
  const [editing, setEditing] = React.useState<AlbumRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["albums"],
    queryFn: albumsApi.list,
    staleTime: 30_000,
  });

  const albums = data?.albums ?? [];

  const create = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await albumsApi.create({ name: name.trim(), description: description.trim() || null });
      toast.success("Album criado.");
      setCreateOpen(false);
      setName("");
      setDescription("");
      void queryClient.invalidateQueries({ queryKey: ["albums"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar o album.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (): Promise<void> => {
    if (!editing) return;
    try {
      await albumsApi.update(editing.id, {
        name: editing.name,
        description: editing.description ?? null,
      });
      toast.success("Album atualizado.");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["albums"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar.");
    }
  };

  const remove = async (): Promise<void> => {
    if (!removing) return;
    try {
      await albumsApi.remove(removing.id, deleteFiles);
      toast.success(
        deleteFiles ? "Album e imagens enviados para a lixeira." : "Album excluido (imagens preservadas).",
      );
      setRemoving(null);
      setDeleteFiles(false);
      void queryClient.invalidateQueries({ queryKey: ["albums"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Imagens e albuns</h1>
          <p className="text-sm text-muted-foreground">
            {albums.length} album(ns) · as imagens continuam no acervo mesmo fora dos albuns.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <FolderPlus aria-hidden /> Novo album
        </Button>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-52 w-full" />
          ))}
        </div>
      ) : albums.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Images className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Nenhum album ainda</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Crie um album para organizar suas imagens. O album guarda apenas referencias - os arquivos nao sao
              duplicados.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <FolderPlus aria-hidden /> Criar album
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {albums.map((album) => (
            <Card key={album.id} className="group overflow-hidden border-border/60 transition-colors hover:border-primary/40">
              <Link href={`/imagens/${album.id}`} className="block">
                <div className="flex aspect-[4/3] items-center justify-center bg-muted/50">
                  <Images className="h-10 w-10 text-muted-foreground" aria-hidden />
                </div>
              </Link>
              <CardContent className="flex items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/imagens/${album.id}`} className="truncate text-sm font-medium hover:underline">
                    {album.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {album.file_count} imagem(ns) · {formatDate(album.created_at)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Acoes do album ${album.name}`}>
                      <MoreVertical aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing({ ...album });
                      }}
                    >
                      <Pencil aria-hidden /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setRemoving(album);
                        setDeleteFiles(false);
                      }}
                    >
                      <Trash2 aria-hidden /> Excluir album
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo album</DialogTitle>
            <DialogDescription>Organize imagens em colecoes sem duplicar os arquivos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="album-name">Nome</Label>
              <Input
                id="album-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Viagem 2026"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="album-description">Descricao</Label>
              <Textarea
                id="album-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void create()} loading={saving}>
              Criar album
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar album</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-album-name">Nome</Label>
              <Input
                id="edit-album-name"
                value={editing?.name ?? ""}
                onChange={(event) => setEditing((current) => (current ? { ...current, name: event.target.value } : current))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-album-description">Descricao</Label>
              <Textarea
                id="edit-album-description"
                value={editing?.description ?? ""}
                onChange={(event) =>
                  setEditing((current) => (current ? { ...current, description: event.target.value } : current))
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveEdit()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir album &quot;{removing?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Por padrao as imagens permanecem na biblioteca. Marque a opcao abaixo para tambem envia-las para a lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(event) => setDeleteFiles(event.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Excluir tambem as imagens do album
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Excluir album</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? <Loader2 className="hidden" aria-hidden /> : null}
    </div>
  );
}
