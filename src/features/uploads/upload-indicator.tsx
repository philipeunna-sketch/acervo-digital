"use client";

import * as React from "react";
import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { useUploadQueue } from "@/features/uploads/upload-provider";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatEta, formatSpeed } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * Indicador flutuante de uploads ativos. Fica disponivel em todas as telas
 * para que o usuario acompanhe o envio enquanto navega.
 */
export function UploadIndicator(): React.JSX.Element | null {
  const { items, activeCount } = useUploadQueue();
  const active = items.filter((item) =>
    ["queued", "preparing", "uploading", "completing"].includes(item.status),
  );

  if (activeCount === 0) return null;

  const total = active.reduce((sum, item) => sum + item.size, 0);
  const uploaded = active.reduce((sum, item) => sum + item.uploadedBytes, 0);
  const percent = total > 0 ? Math.round((uploaded / total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 rounded-lg border border-border bg-popover p-3 shadow-xl">
      <div className="flex items-center gap-2">
        <UploadCloud className="h-4 w-4 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">
          Enviando {activeCount} arquivo{activeCount > 1 ? "s" : ""}
        </p>
        <span className="ml-auto text-xs text-muted-foreground">{percent}%</span>
      </div>
      <Progress value={percent} className="mt-2" aria-label="Progresso do upload" />
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {formatBytes(uploaded)} de {formatBytes(total)}
        </span>
        <Link href="/uploads" className="underline-offset-4 hover:underline">
          Detalhes
        </Link>
      </div>
      <ul className="mt-2 space-y-1">
        {active.slice(0, 3).map((item) => (
          <li key={item.id} className="truncate text-xs text-muted-foreground">
            <span className="text-foreground">{item.fileName}</span>
            {item.etaSeconds !== null ? (
              <span className="ml-1">
                {formatSpeed(item.speed)} · {formatEta(item.etaSeconds)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <span className={cn("sr-only")}>Uploads em andamento</span>
    </div>
  );
}
