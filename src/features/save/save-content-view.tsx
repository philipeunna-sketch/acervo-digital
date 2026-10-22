/* eslint-disable @next/next/no-img-element -- imagens privadas servidas por URL assinada: o proxy do next/image nao se aplica. */
"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Info,
  Loader2,
  Search,
  Sparkles,
  Video,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { albumsApi, importsApi } from "@/features/files/api";
import { formatBytes } from "@/lib/utils/format";
import type { ImportCandidateRecord } from "@/types";

interface SearchResultItem {
  title: string;
  url: string;
  description: string;
  thumbnail: string | null;
  publishedDate: string | null;
  source: string;
}

export function SaveContentView(): React.JSX.Element {
  const [mode, setMode] = React.useState<"search" | "url">("search");
  const [term, setTerm] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [results, setResults] = React.useState<SearchResultItem[]>([]);
  const [provider, setProvider] = React.useState<string>("");
  const [pageInfo, setPageInfo] = React.useState<{
    title: string | null;
    description: string | null;
    source: { label: string; kind: string; note?: string };
    notes: string[];
    usedAi: boolean;
    aiModel: string | null;
  } | null>(null);
  const [candidates, setCandidates] = React.useState<ImportCandidateRecord[]>([]);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [albumId, setAlbumId] = React.useState<string>("none");
  const [providerId, setProviderId] = React.useState<string>("default");
  const [importedIds, setImportedIds] = React.useState<string[]>([]);

  const { data: albums } = useQuery({
    queryKey: ["albums"],
    queryFn: albumsApi.list,
    staleTime: 60_000,
  });

  const { data: library } = useQuery({
    queryKey: ["library-providers"],
    queryFn: async (): Promise<{ providers: Array<{ id: string; name: string }> }> => {
      const response = await fetch("/api/files?pageSize=1");
      if (!response.ok) return { providers: [] };
      return (await response.json()) as { providers: Array<{ id: string; name: string }> };
    },
    staleTime: 60_000,
  });

  const runSearch = async (): Promise<void> => {
    if (term.trim().length < 2) return;
    setSearching(true);
    setResults([]);
    try {
      const payload = await importsApi.search(term.trim());
      setResults(payload.results as unknown as SearchResultItem[]);
      setProvider(payload.provider);
      if (payload.results.length === 0) {
        toast.info("Nenhum resultado retornado pelo provedor de pesquisa.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na pesquisa.");
    } finally {
      setSearching(false);
    }
  };

  const analyze = async (target: string): Promise<void> => {
    setAnalyzing(true);
    setCandidates([]);
    setSelected(new Set());
    setImportedIds([]);
    try {
      const payload = await importsApi.analyze(target);
      setJobId(payload.job.id);
      setPageInfo({
        title: payload.page.title,
        description: payload.page.description,
        source: payload.source,
        notes: payload.notes,
        usedAi: payload.usedAi,
        aiModel: payload.aiModel,
      });
      setCandidates(payload.candidates);
      setSelected(new Set(payload.candidates.map((candidate) => candidate.id)));
      if (payload.candidates.length === 0) {
        toast.info("Nenhuma midia disponivel foi identificada nesta origem.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao analisar a URL.");
    } finally {
      setAnalyzing(false);
    }
  };

  const importSelected = async (): Promise<void> => {
    if (!jobId || selected.size === 0) return;
    setImporting(true);
    try {
      await importsApi.commit({
        jobId,
        candidateIds: Array.from(selected),
        albumId: albumId === "none" ? null : albumId,
        providerId: providerId === "default" ? null : providerId,
      });
      toast.success("Importacao iniciada. Os arquivos serao gravados no acervo.");
      setImportedIds(Array.from(selected));
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao iniciar a importacao.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Salvar conteudo</h1>
        <p className="text-sm text-muted-foreground">
          Descubra midias na internet e importe para o acervo. Apenas conteudo publicado pela propria origem e
          Midias obtidas por APIs oficiais sao utilizadas.
        </p>
      </header>

      <Tabs value={mode} onValueChange={(value) => setMode(value as "search" | "url")}>
        <TabsList>
          <TabsTrigger value="search">
            <Search className="h-4 w-4" aria-hidden /> Pesquisa por palavra-chave
          </TabsTrigger>
          <TabsTrigger value="url">
            <Globe className="h-4 w-4" aria-hidden /> Analise de URL
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="search-term">Termo de pesquisa</Label>
                <Input
                  id="search-term"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runSearch();
                  }}
                  placeholder="paisagem montanhosa em 4K"
                />
              </div>
              <Button onClick={() => void runSearch()} loading={searching}>
                {!searching ? <Search aria-hidden /> : null} Pesquisar
              </Button>
            </CardContent>
          </Card>

          {provider ? (
            <p className="text-xs text-muted-foreground">Resultados reais retornados pelo provedor &quot;{provider}&quot;.</p>
          ) : null}

          {searching ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-44 w-full" />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((result) => (
                <Card key={result.url} className="flex flex-col overflow-hidden border-border/60">
                  <div className="aspect-video w-full overflow-hidden bg-muted/50">
                    {result.thumbnail ? (
                      <img
                        src={result.thumbnail}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Globe className="h-8 w-8 text-muted-foreground" aria-hidden />
                      </div>
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-2 p-4">
                    <p className="line-clamp-2 text-sm font-medium">{result.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{result.description}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {result.source}
                      {result.publishedDate ? ` · ${result.publishedDate}` : ""}
                    </p>
                    <div className="mt-auto flex items-center gap-2 pt-2">
                      <Button size="sm" variant="outline" asChild>
                        <a href={result.url} target="_blank" rel="noreferrer noopener">
                          Abrir <ExternalLink aria-hidden />
                        </a>
                      </Button>
                      <Button size="sm" onClick={() => void analyze(result.url)}>
                        Analisar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : searching ? null : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Pesquise para ver resultados reais do provedor configurado.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="url" className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="analyze-url">URL publica</Label>
                <Input
                  id="analyze-url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void analyze(url);
                  }}
                  placeholder="https://x.com/usuario/status/1234567890"
                />
              </div>
              <Button onClick={() => void analyze(url)} loading={analyzing}>
                {!analyzing ? <Globe aria-hidden /> : null} Analisar conteudo
              </Button>
            </CardContent>
          </Card>

          {analyzing ? (
            <Card>
              <CardContent className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Analisando a origem...
              </CardContent>
            </Card>
          ) : null}

          {pageInfo ? (
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">{pageInfo.title ?? pageInfo.source.label}</CardTitle>
                <CardDescription>
                  Origem: {pageInfo.source.label}
                  {pageInfo.source.note ? ` — ${pageInfo.source.note}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pageInfo.description ? <p className="text-sm text-muted-foreground">{pageInfo.description}</p> : null}
                {pageInfo.usedAi ? (
                  <Badge variant="info">
                    <Sparkles className="h-3 w-3" aria-hidden /> Organizado por IA ({pageInfo.aiModel})
                  </Badge>
                ) : (
                  <Badge variant="secondary">Organizado por heuristicas locais (IA nao configurada)</Badge>
                )}
                {pageInfo.notes.map((note) => (
                  <p key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {note}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {candidates.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {candidates.length} midia(s) encontrada(s)
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(new Set(candidates.map((candidate) => candidate.id)))}
                  >
                    Selecionar todos
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(new Set())}
                  >
                    Limpar selecao
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {candidates.map((candidate) => (
                  <Card key={candidate.id} className="flex flex-col overflow-hidden border-border/60">
                    <div className="relative aspect-video w-full overflow-hidden bg-muted/50">
                      {candidate.thumbnail_url ? (
                        <img
                          src={candidate.thumbnail_url}
                          alt={candidate.title ?? candidate.source_url}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          {candidate.media_type === "video" ? (
                            <Video className="h-8 w-8 text-muted-foreground" aria-hidden />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
                          )}
                        </div>
                      )}
                      <div className="absolute left-2 top-2 rounded-md bg-background/80 p-1 backdrop-blur">
                        <Checkbox
                          checked={selected.has(candidate.id)}
                          onCheckedChange={(checked) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (checked === true) next.add(candidate.id);
                              else next.delete(candidate.id);
                              return next;
                            })
                          }
                          aria-label={`Selecionar ${candidate.suggested_name ?? candidate.source_url}`}
                        />
                      </div>
                      <Badge variant="secondary" className="absolute right-2 top-2">
                        {candidate.media_type}
                      </Badge>
                    </div>
                    <CardContent className="flex flex-1 flex-col gap-2 p-4">
                      <p className="truncate text-sm font-medium">{candidate.suggested_name ?? candidate.title}</p>
                      {candidate.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{candidate.description}</p>
                      ) : null}
                      <p className="truncate text-[11px] text-muted-foreground">{candidate.source_url}</p>
                      <div className="flex flex-wrap gap-1">
                        {(candidate.suggested_tags ?? []).map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <span className="text-xs text-muted-foreground">
                          {candidate.size_bytes ? formatBytes(candidate.size_bytes) : "Tamanho desconhecido"}
                        </span>
                        <Button size="sm" variant="outline" asChild>
                          <a href={candidate.source_url} target="_blank" rel="noreferrer noopener">
                            Ver <ExternalLink aria-hidden />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="border-border/60">
                <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="import-album">Album de destino</Label>
                    <Select value={albumId} onValueChange={setAlbumId}>
                      <SelectTrigger id="import-album">
                        <SelectValue placeholder="Sem album" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem album</SelectItem>
                        {(albums?.albums ?? []).map((album) => (
                          <SelectItem key={album.id} value={album.id}>
                            {album.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex-1 space-y-2">
                    <Label htmlFor="import-provider">Provedor de destino</Label>
                    <Select value={providerId} onValueChange={setProviderId}>
                      <SelectTrigger id="import-provider">
                        <SelectValue placeholder="Provedor padrao" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Provedor padrao</SelectItem>
                        {(library?.providers ?? []).map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={() => void importSelected()} loading={importing} disabled={selected.size === 0}>
                    {!importing ? <Download aria-hidden /> : null} Salvar selecionados ({selected.size})
                  </Button>
                </CardContent>
              </Card>

              {importedIds.length > 0 ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
                  <span>Importacao concluida. Os arquivos ja estao registrados na biblioteca.</span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/biblioteca">Abrir biblioteca</Link>
                  </Button>
                </div>
              ) : null}
            </>
          ) : pageInfo && !analyzing ? (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="flex items-start gap-3 p-6 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" aria-hidden />
                <div>
                  <p className="font-medium">Nenhuma midia encontrada</p>
                  <p className="mt-1 text-muted-foreground">
                    A origem nao disponibilizou midias acessiveis. Verifique as notas acima - algumas plataformas
                    exigem credencial de API oficial para expor o conteudo.
                  </p>
               