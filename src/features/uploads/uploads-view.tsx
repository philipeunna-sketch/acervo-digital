"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Pause,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { uploadsApi } from "@/features/files/api";
import { useUploadQueue } from "@/features/uploads/upload-provider";
import { formatBytes, formatDate, formatEta, formatSpeed } from "@/lib/utils/format";
import type { UploadSessionRecord } from "@/types";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  preparing: { label: "Preparando", variant: "secondary" },
  uploading: { label: "Enviando", variant: "default" },
  paused: { label: "Pausado", variant: "warning" },
  completing: { label: "Finalizando", variant: "secondary" },
  completed: { label: "Concluido", variant: "success" },
  failed: { label: "Falhou", variant: "destructive" },
  canceled: { label: "Cancelado", variant: "destructive" },
};

export function UploadsView(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { items, cancel, retry, remove, clearFinished } = useUploadQueue();

  const { data, isLoading } = useQuery({
    queryKey: ["upload-sessions"],
    queryFn: uploadsApi.list,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const sessions = data?.sessions ?? [];
  const live = items.length > 0;

  const totalActive = items.filter((item) =>
    ["queued", "preparing", "uploading", "completing"].includes(item.status),
  ).length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Uploads em andamento</h1>
          <p className="text-sm text-muted-foreground">
            {totalActive > 0
              ? `${totalActive} envio(s) ativo(s) nesta sessao.`
              : "Nenhum envio ativo nesta sessao."}
          </p>
        </div>
        {live ? (
          <Button variant="outline" size="sm" onClick={clearFinished}>
            Limpar concludedos
          </Button>
        ) : null}
      </header>

      {live ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Sessao atual</h2>
          {items.map((item) => {
            const percent = item.size > 0 ? Math.round((item.uploadedBytes / item.size) * 100) : 0;
            return (
              <Card key={item.id} className="border-border/60">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(item.uploadedBytes)} de {formatBytes(item.size)} ({percent}%)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_LABEL[item.status]?.variant ?? "secondary"}>
                        {STATUS_LABEL[item.status]?.label ?? item.status}
                      </Badge>
                      {["queued", "preparing", "uploading", "completing"].includes(item.status) ? (
                        <Button variant="ghost" size="icon-sm" onClick={() => cancel(item.id)} aria-label="Cancelar upload">
                          <X aria-hidden />
                        </Button>
                      ) : null}
                      {item.status === "failed" || item.status === "paused" ? (
                        <Button variant="outline" size="sm" onClick={() => retry(item.id)}>
                          <RotateCcw aria-hidden /> Reenviar
                        </Button>
                      ) : null}
                      {["completed", "canceled", "failed"].includes(item.status) ? (
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(item.id)} aria-label="Remover da lista">
                          <Trash2 aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <Progress value={percent} aria-label={`Progresso de ${item.fileName}`} />

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatSpeed(item.speed)}</span>
                    {item.etaSeconds !== null ? <span>Tempo restante: {formatEta(item.etaSeconds)}</span> : null}
                    {item.error ? <span className="text-destructive">{item.error}</span> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Historico de envios</h2>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Nenhum upload registrado</p>
              <p className="text-sm text-muted-foreground">
                Envie arquivos pela biblioteca ou pelo botao no topo da pagina.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {sessions.map((session: UploadSessionRecord) => (
                  <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    {session.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                    ) : session.status === "failed" || session.status === "canceled" ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                    ) : (
                      <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{session.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(session.size_bytes)} · {formatDate(session.created_at)}
                        {session.error_message ? ` · ${session.error_message}` : ""}
                      </p>
                    </div>
                    <Badge variant={STATUS_LABEL[session.status]?.variant ?? "secondary"}>
                      {STATUS_LABEL[session.status]?.label ?? session.status}
                    </Badge>
                    {["preparing", "uploading", "paused", "completing"].includes(session.status) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void uploadsApi.cancel(session.id);
                          void queryClient.invalidateQueries({ queryKey: ["upload-sessions"] });
                        }}
                      >
                        <Pause aria-hidden /> Cancelar
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Uploads ficam ativos enquanto a aba estiver aberta. Ao recarregar a pagina, envios interrompidos aparecem como
        pausados e podem ser reenviados (o upload e reiniciado do zero).
      </p>
    </div>
  );
}
