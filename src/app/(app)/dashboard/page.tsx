import * as React from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db/client";
import { dashboardStats } from "@/lib/db/repo/stats";
import { StatCard } from "@/features/dashboard/stat-card";
import { DistributionCard } from "@/features/dashboard/distribution-card";
import { RecentFiles } from "@/features/dashboard/recent-files";
import { UploadButton } from "@/features/uploads/upload-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Database, Upload, CheckCircle2, XCircle, HardDrive, FileText, Image as ImageIcon, Film } from "lucide-react";
import { formatBytes, formatNumber } from "@/lib/utils/format";
import Link from "next/link";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await getCurrentUser();
  if (!user) return <p>Sem sessao ativa.</p>;

  const stats = await withUser(user.id, (db) => dashboardStats(db, user.id));
  const totalBytes = stats.totals.bytes;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visao geral do acervo em {stats.storage.providerName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/salvar">
              <Globe aria-hidden /> Salvar conteudo
            </Link>
          </Button>
          <UploadButton />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Arquivos"
          value={formatNumber(stats.totals.files)}
          hint={`${formatNumber(stats.totals.favorites)} favoritos · ${formatNumber(stats.totals.trashed)} na lixeira`}
          icon={<Database className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          title="Espaco ocupado"
          value={formatBytes(totalBytes)}
          hint={
            stats.storage.totalBytes
              ? `de ${formatBytes(stats.storage.totalBytes)} disponiveis`
              : "Total do acervo (limitado pelo provedor)"
          }
          icon={<HardDrive className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          title="Uploads ativos"
          value={formatNumber(stats.uploads.active)}
          hint={`${formatNumber(stats.uploads.completed)} concluidos`}
          icon={<Upload className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          title="Uploads com falha"
          value={formatNumber(stats.uploads.failed)}
          hint="Reenvie pela pagina de uploads"
          icon={<XCircle className="h-4 w-4" aria-hidden />}
          tone={stats.uploads.failed > 0 ? "danger" : "default"}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Documentos"
          value={formatNumber(stats.totals.documents)}
          icon={<FileText className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          title="Imagens"
          value={formatNumber(stats.totals.images)}
          icon={<ImageIcon className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          title="Videos"
          value={formatNumber(stats.totals.videos)}
          icon={<Film className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          title="Albums"
          value={formatNumber(stats.totals.albums)}
          hint="Colecoes de imagens"
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DistributionCard
          title="Distribuicao por tipo"
          items={stats.byType.map((row) => ({
            label: row.category,
            count: row.count,
            bytes: Number(row.bytes),
            percent: totalBytes > 0 ? (Number(row.bytes) / totalBytes) * 100 : 0,
          }))}
        />
        <DistributionCard
          title="Distribuicao por provedor"
          items={stats.byProvider.map((row) => ({
            label: row.label,
            count: row.count,
            bytes: Number(row.bytes),
            percent: totalBytes > 0 ? (Number(row.bytes) / totalBytes) * 100 : 0,
          }))}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <RecentFiles title="Adicionados recentemente" files={stats.recentFiles} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Arquivos mais pesados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.largestFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum arquivo enviado ate agora.</p>
            ) : (
              stats.largestFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
