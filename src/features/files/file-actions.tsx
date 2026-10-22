"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Download,
  Eye,
  Link2,
  MoreVertical,
  Pencil,
  Star,
  StarOff,
  Trash2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { filesApi } from "@/features/files/api";
import type { FileRecord } from "@/types";

interface FileActionsProps {
  file: FileRecord;
  onPreview?: (file: FileRecord) => void;
  onEdit?: (file: FileRecord) => void;
  onChanged?: () => void;
  showRestore?: boolean;
}

export function FileActions({
  file,
  onPreview,
  onEdit,
  onChanged,
  showRestore = false,
}: FileActionsProps): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const refresh = (): void => {
    onChanged?.();
  };

  const copyLink = async (): Promise<void> => {
    try {
      const { url } = await filesApi.link(file.id, false);
      await navigator.clipboard.writeText(url);
      toast.success("Link temporario copiado (expira em poucos minutos).");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao gerar o link.");
    }
  };

  const download = async (): Promise<void> => {
    try {
      const { url } = await filesApi.link(file.id, true);
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao baixar.");
    }
  };

  const toggleFavorite = async (): Promise<void> => {
    setBusy(true);
    try {
      await filesApi.favorite(file.id, !file.is_favorite);
      toast.success(file.is_favorite ? "Removido dos favoritos." : "Adicionado aos favoritos.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar favorito.");
    } finally {
      setBusy(false);
    }
  };

  const trash = async (): Promise<void> => {
    setBusy(true);
    try {
      await filesApi.trash(file.id);
      toast.success("Arquivo enviado para a lixeira.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao mover para a lixeira.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (): Promise<void> => {
    setBusy(true);
    try {
      await filesApi.restore(file.id);
      toast.success("Arquivo restaurado.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao restaurar.");
    } finally {
      setBusy(false);
    }
  };

  const removeForever = async (): Promise<void> => {
    setBusy(true);
    try {
      await filesApi.removeForever(file.id);
      toast.success("Arquivo excluido definitivamente.");
      setConfirmDelete(false);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acoes para ${file.name}`} disabled={busy}>
            <MoreVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate">{file.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {onPreview ? (
            <DropdownMenuItem onSelect={() => onPreview(file)}>
              <Eye aria-hidden /> Visualizar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void download()}>
            <Download aria-hidden /> Baixar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <Link2 aria-hidden /> Copiar link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {onEdit ? (
            <DropdownMenuItem onSelect={() => onEdit(file)}>
              <Pencil aria-hidden /> Renomear / editar
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void toggleFavorite()}>
            {file.is_favorite ? <StarOff aria-hidden /> : <Star aria-hidden />}
            {file.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          </DropdownMenuItem>
          {showRestore ? (
            <DropdownMenuItem onSelect={() => void restore()}>
              <RotateCcw aria-hidden /> Restaurar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => void trash()}>
              <Trash2 aria-hidden /> Mover para lixeira
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {showRestore ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <XCircle aria-hidden /> Excluir definitivamente
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo &quot;{file.name}&quot; e o objeto no storage serao removidos. Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeForever()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
