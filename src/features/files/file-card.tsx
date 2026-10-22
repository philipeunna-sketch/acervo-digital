/* eslint-disable @next/next/no-img-element -- imagens privadas servidas por URL assinada: o proxy do next/image nao se aplica. */
"use client";

import * as React from "react";
import { FileTypeIcon, categoryLabel } from "@/features/files/file-type-icon";
import { FileActions } from "@/features/files/file-actions";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDate } from "@/lib/utils/format";
import { Checkbox } from "@/components/ui/checkbox";
import { Star } from "lucide-react";
import type { FileRecord } from "@/types";

interface FileCardProps {
  file: FileRecord;
  thumbnailUrl?: string | null;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onPreview?: (file: FileRecord) => void;
  onEdit?: (file: FileRecord) => void;
  onChanged?: () => void;
}

export function FileCard({
  file,
  thumbnailUrl,
  selected,
  onSelect,
  onPreview,
  onEdit,
  onChanged,
}: FileCardProps): React.JSX.Element {
  const [loaded, setLoaded] = React.useState(false);

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card transition-colors",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
      )}
    >
      <div
        className="relative aspect-[4/3] w-full cursor-pointer overflow-hidden bg-muted/60"
        onClick={() => onPreview?.(file)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPreview?.(file);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Abrir ${file.name}`}
      >
        {thumbnailUrl && file.category === "image" ? (
          <>
            {!loaded ? <div className="absolute inset-0 skeleton" aria-hidden /> : null}
            <img
              src={thumbnailUrl}
              alt={file.name}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              className={cn(
                "h-full w-full object-cover transition-opacity",
                loaded ? "opacity-100" : "opacity-0",
              )}
            />
          </>
        ) : thumbnailUrl && file.category === "video" ? (
          <video
            src={thumbnailUrl}
            preload="metadata"
            muted
            className="h-full w-full bg-black object-cover"
            aria-label={`Miniatura do video ${file.name}`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <FileTypeIcon category={file.category} className="h-8 w-8" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {file.extension ? `.${file.extension}` : categoryLabel(file.category)}
            </span>
          </div>
        )}

        {onSelect ? (
          <div className="absolute left-2 top-2 rounded-md bg-background/80 p-1 backdrop-blur">
            <Checkbox
              checked={Boolean(selected)}
              onCheckedChange={(checked) => onSelect(checked === true)}
              aria-label={`Selecionar ${file.name}`}
            />
          </div>
        ) : null}

        {file.is_favorite ? (
          <span className="absolute right-2 top-2 rounded-md bg-background/80 p-1 text-warning backdrop-blur">
            <Star className="h-3.5 w-3.5 fill-current" aria-label="Favorito" />
          </span>
        ) : null}
      </div>

      <div className="flex items-start gap-2 border-t border-border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
          </p>
        </