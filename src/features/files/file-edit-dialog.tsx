"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { albumsApi, filesApi } from "@/features/files/api";
import type { AlbumRecord, FileRecord } from "@/types";

interface FileEditDialogProps {
  file: FileRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function FileEditDialog({
  file,
  open,
  onOpenChange,
  onSaved,
}: FileEditDialogProps): React.JSX.Element {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [albumIds, setAlbumIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  const { data: albums } = useQuery({
    queryKey: ["albums"],
    queryFn: albumsApi.list,
    enabled: open,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!file || !open) return;
    setName(file.name);
    setDescription(file.description ?? "");
    setTags("");
    setAlbumIds([]);
    void (async () => {
      try {
        const detail = await filesApi.get(file.id);
        setAlbumIds(detail.albumIds);
        setTags(detail.tags.map((tag) => tag.name).join(", "));
      } catch {
        // Mantem os valores atuais se a leitura falhar.
      }
    })();
  }, [file, open]);

  const save = async (): Promise<void> => {
    if (!file) return;
    setSaving(true);
    try {
      await filesApi.update(file.id, {
        name: name.trim() || file.name,
        description: description.trim() || null,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        albumIds,
      });
      toast.success("Arquivo atualizado.");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar arquivo</DialogTitle>
          <DialogDescription>Renomeie, descreva, adicione tags e mova para albums.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-name">Nome</Label>
            <Input id="file-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-description">Descricao</Label>
            <Textarea
              id="file-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-tags">Tags (separadas por virgula)</Label>
            <Input
              id="file-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="projeto, 2026, imagem"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Albums</legend>
            {(albums?.albums ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum album criado ainda.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {(albums?.albums ?? []).map((album: AlbumRecord) => (
                  <label key={album.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={albumIds.includes(album.id)}
                      onCheckedChange={(checked) =>
                        setAlbumIds((current) =>
                          checked === true
                            ? [...current, album.id]
                            : current.filter((id) => id !== album.id),
                        )
                      }
                    />
                    {album.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
