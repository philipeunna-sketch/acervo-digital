import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileTypeIcon } from "@/features/files/file-type-icon";
import { formatBytes, formatDate } from "@/lib/utils/format";
import type { FileRecord } from "@/types";

export function RecentFiles({ title, files }: { title: string; files: FileRecord[] }): React.JSX.Element {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum arquivo ainda. Envie arquivos ou use <Link href="/salvar" className="underline underline-offset-4">Salvar conteudo</Link> para
            importar midias da internet.
          </p>
        ) : (
          files.map((file) => (
            <Link
              key={file.id}
              href={`/biblioteca?arquivo=${file.id}`}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
            >
              <FileTypeIcon category={file.category} />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {formatBytes(file.size_bytes)}
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                {formatDate(file.created_at)}
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
