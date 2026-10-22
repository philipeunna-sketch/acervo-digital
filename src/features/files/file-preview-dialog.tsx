/* eslint-disable @next/next/no-img-element -- imagens privadas servidas por URL assinada: o proxy do next/image nao se aplica. */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, FileText, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { filesApi } from "@/features/files/api";
import { formatBytes } from "@/lib/utils/format";
import type { FileRecord } from "@/types";

interface FilePreviewDialogProps {
  file: FileRecord | null;
  files?: FileRecord[];
  onClose: () => void;
  onChanged?: () => void;
}

/**
 * Visualizador unico: imagens (lightbox), videos (player HTML5), PDFs
 * (visualizador nativo) e textos (conteudo extraido no servidor).
 */
export function FilePreviewDialog({
  file,
  files = [],
  onClose,
  onChanged,
}: FilePreviewDialogProps): React.JSX.Element {
  const [url, setUrl] = React.useState<string | null>(null);
  const [text, setText] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);

  const index = file ? files.findIndex((item) => item.id === file.id) : -1;

  const goTo = React.useCallback(
    (delta: number) => {
      if (index < 0 || files.length === 0) return;
      const next = files[(index + delta + files.length) % files.length];
      if (!next) return;
      onChanged?.();
      window.dispatchEvent(new CustomEvent("acervo:preview", { detail: next.id }));
    },
    [files, index, onChanged],
  );

  React.useEffect(() => {
    if (!file) {
      setUrl(null);
      setText(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setText(null);

    void (async () => {
      try {
        const link = await filesApi.link(file.id, false);
        if (!active) return;
        setUrl(link.url);

        if (file.category === "document" && /\.(txt|md|markdown|rtf|docx)$/i.test(file.name)) {
          const content = await filesApi.text(file.id);
          if (!active) return;
          if (content.kind === "ok") setText(content.text ?? "");
          else setText(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Falha ao carregar o arquivo.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [file]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "ArrowRight") goTo(1);
      if (event.key === "ArrowLeft") goTo(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const download = async (): Promise<void> => {
    if (!file) return;
    try {
      const link = await filesApi.link(file.id, true);
      window.location.href = link.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao baixar.");
    }
  };

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`max-w-5xl ${fullscreen ? "h-[92vh] max-w-[95vw]" : "max-h-[90vh]"}`}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{file?.name ?? "Visualizacao"}</DialogTitle>

        <div className="flex items-center gap-2 pr-8">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{file?.name}</p>
          <span className="shrink-0 text-xs text-muted-foreground">{file ? formatBytes(file.size_bytes) : ""}</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setFullscreen((value) => !value)} aria-label="Alternar tela cheia">
            <Maximize2 aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => void download()} aria-label="Baixar arquivo">
            <Download aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
            <X aria-hidden />
          </Button>
        </div>

        <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg bg-muted/40">
          {loading ? <Skeleton className="absolute inset-0 h-full w-full" /> : null}
          {error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : null}

          {file && url && !loading ? (
            <>
              {file.category === "image" ? (
                <img
                  src={url}
                  alt={file.name}
                  className="mx-auto max-h-[70vh] w-auto object-contain"
                />
              ) : null}
              {file.category === "video" ? (
                <video
                  src={url}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[70vh] w-full rounded-lg bg-black"
                >
                  <track kind="captions" />
                </video>
              ) : null}
              {file.mime_type === "application/pdf" ? (
                <object data={url} type="application/pdf" className="h-[70vh] w-full rounded-lg bg-white">
                  <p className="p-4 text-sm">
                   Seu navegador nao consegue exibir PDFs.{" "}
                    <button type="button" className="underline" onClick={() => void download()}>
                      Baixe o arquivo
                    </button>
                    .
                  </p>
                </object>
              ) : null}
              {file.category === "document" && !file.mime_type.includes("pdf") ? (
                text !== null ? (
                  <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed">
                    {text || "(O documento nao possui texto extraivel.)"}
                  </pre>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      Este formato nao possui pre-visualizacao. Baixe o arquivo para abrir.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => void download()}>
                      <Download aria-hidden /> Baixar
                    </Button>
                  </div>
                )
              ) : null}
              {file.category !== "document" && file.category !== "image" && file.category !== "video" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Sem visualizador para este tipo. Baixe o arquivo.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void download()}>
                    <Download aria-hidden /> Baixar
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {files.length > 1 ? (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => goTo(-1)}>
              <ChevronLeft aria-hidden /> Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {index + 1} de {files.length}
            </span>
            <Button variant="ghost" size="sm" onClick={() => goTo(1)}>
              Proxima <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
