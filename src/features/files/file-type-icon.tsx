"use client";

import {
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  File as FileIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { FileCategory } from "@/types";

const ICONS: Record<FileCategory, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  image: ImageIcon,
  video: Film,
  audio: Music,
  archive: Archive,
  other: FileIcon,
};

const COLORS: Record<FileCategory, string> = {
  document: "text-sky-400",
  image: "text-emerald-400",
  video: "text-violet-400",
  audio: "text-amber-400",
  archive: "text-orange-400",
  other: "text-zinc-400",
};

export function FileTypeIcon({
  category,
  className,
}: {
  category: FileCategory;
  className?: string;
}): React.JSX.Element {
  const Icon = ICONS[category] ?? FileIcon;
  return <Icon className={cn("h-4 w-4", COLORS[category] ?? COLORS.other, className)} aria-hidden />;
}

export function categoryLabel(category: FileCategory): string {
  const labels: Record<FileCategory, string> = {
    document: "Documento",
    image: "Imagem",
    video: "Video",
    audio: "Audio",
    archive: "Arquivo",
    other: "Outro",
  };
  return labels[category] ?? "Arquivo";
}
