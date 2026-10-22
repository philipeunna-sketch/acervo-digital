/* eslint-disable @next/next/no-img-element -- imagens privadas servidas por URL assinada: o proxy do next/image nao se aplica. */
"use client";

import * as React from "react";
import { FileTypeIcon } from "@/features/files/file-type-icon";
import { FileActions } from "@/features/files/file-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDate } from "@/lib/utils/format";
import type { FileRecord } from "@/types";

interface FileRowProps {
  file: FileRecord;
  thumbnailUrl?: string | null;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onPreview?: (file: FileRecord) => void;
  onEdit?: (file: FileRecord) => void;
  onChanged?: () => void;
  showStatus?: boolean;
}

export function FileRow({
  file,
  thumbnailUrl,
  selected,
  onSelect,
  onPreview,
  onEdit,
  onChanged,
  showStatus = false,
}: FileRowProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr] items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors sm:grid-cols-[auto_44px_minmax(0,2fr)_minmax(0,1fr)_120px_150px_auto]",
        selected ? "bg-accent/60" : "hover:bg-accent/30",
      )}
    >
      {onSelect ? (
        <Checkbox
          checked={Boolean(selected)}
          onCheckedChange={(checked) => onSelect(checked === true)}
          aria-label={`Selecionar ${file.name}`}
        />
      ) : (
        <span aria-hidden />
      )}

      <button
        type="button"
        onClick={() => onPreview?.(file)}
        className="hidden h-10 w-11 items-center justify-center overflow-hidden rounded border border-border bg-muted/50 sm:flex"
        aria-label={`Abrir ${file.name}`}
      >
        {thumbnailUrl && file.category === "image" ? (
          <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <FileTypeIcon category={file.category} />
        )}
      </button>

      <div className="min-w-0">
        <p className="truncate font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="truncate text-xs text-muted-foreground sm:hidden">
          {formatBytes(file.size_bytes)} · {formatDate(file.created_at)}
        </p>
      </div>

      <span className="hidden truncate text-xs text-muted-foreground sm:block">
        {file.extension ? `.${file.extension}` : file.mime_type}
      </span>
      <span className="hidden text-xs text-muted-foreground sm:block">{formatBytes(file.size_bytes)}</span>
      <span className="hidden text-xs text-muted-foreground sm:block">
        {showStatus ? file.status : formatDate(file.created_at)}
      </span>

      <div className="flex justify-e