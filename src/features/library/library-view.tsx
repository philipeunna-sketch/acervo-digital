"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Grid2X2,
  List,
  Loader2,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileCard } from "@/features/files/file-card";
import { FileRow } from "@/features/files/file-row";
import { FilePreviewDialog } from "@/features/files/file-preview-dialog";
import { FileEditDialog } from "@/features/files/file-edit-dialog";
import { filesApi, type LibraryQueryParams } from "@/features/files/api";
import { UploadButton } from "@/features/uploads/upload-button";
import { formatNumber } from "@/lib/utils/format";
import type { FileRecord } from "@/types";

const SORT_OPTIONS = [
  { value: "recent", label: "Mais recentes primeiro" },
  { value: "oldest", label: "Mais antigos primeiro" },
  { value: "name_asc", label: "Nome (A-Z)" },
  { value: "name_desc", label: "Nome (Z-A)" },
  { value: "size_desc", label: "Maior tamanho" },
  { value: "size_asc", label: "Menor tamanho" },
  { value: "type", label: "Tipo de arquivo" },
  { value: "provider", label: "Provedor de armazenamento" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "Todos os tipos" },
  { value: "document", label: "Documentos" },
  { value: "image", label: "Imagens" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "archive", label: "Arquivos compactados" },
  { value: "other", label: "Outros" },
];

export interface LibraryViewProps {
  /** Filtros fixos aplicados pela pagina (ex.: category=document). */
  fixedFilters?: Partial<LibraryQueryParams>;
  emptyTitle?: string;
  emptyDescription?: string;
  showStatus?: boolean;
}

export function LibraryView({
  fixedFilters = {},
  emptyTitle = "Nenhum arquivo por aqui",
  emptyDescription = "Envie arquivos ou importe conteudo da internet para comecar.",
  showStatus = false,
}: LibraryViewProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = React.useState<FileRecord | null>(null);
  const [editFile, setEditFile] = React.useState<FileRecord | null>(null);
  const [thumbnails, setThumbnails] = React.useState<Record<string, string>>({});

  const page = Number(searchParams.get("page") ?? 1) || 1;
  const pageSize = Number(searchParams.get("pageSize") ?? 24) || 24;

  const query = React.useMemo<LibraryQueryParams>(() => {
    const params: LibraryQueryParams = {
      ...fixedFilters,
      q: searchParams.get("q") ?? undefined,
      category: (searchParams.get("category") ?? undefined) as LibraryQueryParams["category"],
      providerId: searchParams.get("providerId") ?? undefined,
      albumId: searchParams.get("albumId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      minSize: searchParams.get("minSize") ? Number(searchParams.get("minSize")) : undefined,
      maxSize: searchParams.get("maxSize") ? Number(searchParams.get("maxSize")) : undefined,
      favorite: searchParams.get("favorite") === "true" ? true : undefined,
      processed: (searchParams.get("processed") as "all" | "yes" | "no" | null) ?? undefined,
      status: (searchParams.get("status") as "active" | "trashed" | null) ?? fixedFilters.status ?? "active",
      sort: (searchParams.get("sort") as LibraryQueryParams["sort"]) ?? "recent",
      page,
      pageSize,
    };
    return params;
  }, [searchParams, page, pageSize, fixedFilters]);

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "all") params.delete(key);
      else params.set(key, value);
      if (key !== "page") params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["library", query],
    queryFn: () => filesApi.list(query),
    placeholderData: (previous) => previous,
    staleTime: 10_000,
  });

  const items = React.useMemo(() => data?.items ?? [], [data?.items]);

  // URLs assinadas para miniaturas (somente imagens e videos).
  React.useEffect(() => {
    const targets = items.filter((file) => file.category === "image" || file.category === "video");
    if (targets.length === 0) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/files/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: targets.map((file) => file.id) }),
        });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { links: Array<{ id: string; url: string }> };
        const map: Record<string, string> = {};
        for (const link of payload.links) map[link.id] = link.url;
        if (active) setThumbnails((current) => ({ ...current, ...map }));
      } catch {
        // Miniaturas sao opcionais: a interface funciona sem elas.
      }
    })();
    return () => {
      active = false;
    };
  }, [items]);

  const toggleSelected = (id: string, checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected = items.length > 0 && items.every((file) => selected.has(file.id));

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["library"] });
  };

  const bulk = async (action: "trash" | "restore" | "delete" | "favorite" | "unfavorite"): Promise<void> => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      await filesApi.bulk({ fileIds: ids, action });
      toast.success(
        `${ids.length} arquivo(s) processados.`,
      );
      setSelected(new Set());
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na acao em lote.");
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {fixedFilters.category === "document"
              ? "Documentos e textos"
              : fixedFilters.category === "image"
                ? "Imagens"
                : fixedFilters.category === "video"
                  ? "Videos"
                  : fixedFilters.albumId
                    ? "Album"
                    : fixedFilters.favorite
                      ? "Favoritos"
                      : fixedFilters.status === "trashed"
                        ? "Lixeira"
                        : "Biblioteca completa"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Carregando..." : `${formatNumber(total)} arquivo(s) no acervo`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setView("grid")}
              aria-label="Visao em grade"
              aria-pressed={view === "grid"}
            >
              <Grid2X2 aria-hidden />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={() => setView("list")}
              aria-label="Visao em lista"
              aria-pressed={view === "list"}
            >
              <List aria-hidden />
            </Button>
          </div>
          <UploadButton />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-[200px] flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setParam("q", search.trim() || null);
          }}
        >
          <label htmlFor="library-search" className="sr-only">
            Pesquisar arquivos
          </label>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="library-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por nome, tag ou descricao..."
            className="pl-8"
          />
        </form>

        <Button variant="outline" onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen}>
          <Filter aria-hidden /> Filtros
        </Button>

        <Select value={query.sort ?? "recent"} onValueChange={(value) => setParam("sort", value)}>
          <SelectTrigger className="w-[210px]" aria-label="Ordenar por">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtersOpen ? (
        <Card className="border-border/60">
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="filter-category">Tipo</Label>
              <Select
                value={query.category ?? "all"}
                onValueChange={(value) => setParam("category", value === "all" ? null : value)}
              >
                <SelectTrigger id="filter-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-provider">Provedor</Label>
              <Select
                value={query.providerId ?? "all"}
                onValueChange={(value) => setParam("providerId", value === "all" ? null : value)}
              >
                <SelectTrigger id="filter-provider">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os provedores</SelectItem>
                  {(data?.providers ?? []).map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-from">Criado de</Label>
              <Input
                id="filter-from"
                type="date"
                value={query.from ?? ""}
                onChange={(event) => setParam("from", event.target.value || null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-to">Criado ate</Label>
              <Input
                id="filter-to"
                type="date"
                value={query.to ?? ""}
                onChange={(event) => setParam("to", event.target.value || null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-min">Tamanho minimo (MB)</Label>
              <Input
                id="filter-min"
                type="number"
                min={0}
                value={query.minSize ? Math.round(query.minSize / (1024 * 1024)) : ""}
                onChange={(event) =>
                  setParam("minSize", event.target.value ? String(Number(event.target.value) * 1024 * 1024) : null)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-max">Tamanho maximo (MB)</Label>
              <Input
                id="filter-max"
                type="number"
                min={0}
                value={query.maxSize ? Math.round(query.maxSize / (1024 * 1024)) : ""}
                onChange={(event) =>
                  setParam("maxSize", event.target.value ? String(Number(event.target.value) * 1024 * 1024) : null)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-processed">Processamento</Label>
              <Select
                value={query.processed ?? "all"}
                onValueChange={(value) => setParam("processed", value === "all" ? null : value)}
              >
                <SelectTrigger id="filter-processed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Com texto extraido</SelectItem>
                  <SelectItem value="no">Sem texto extraido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium">Favoritos</span>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox
                  checked={query.favorite === true}
                  onCheckedChange={(checked) => setParam("favorite", checked === true ? "true" : null)}
                />
                Mostrar apenas favoritos
              </label>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (fixedFilters.category) params.set("category", fixedFilters.category);
                  if (fixedFilters.albumId) params.set("albumId", fixedFilters.albumId);
                  if (fixedFilters.favorite) params.set("favorite", "true");
                  if (fixedFilters.status) params.set("status", fixedFilters.status);
                  router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
                  setSearch("");
                }}
              >
                <RotateCcw aria-hidden /> Limpar filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {fixedFilters.status === "trashed" ? (
              <>
                <Button variant="outline" size="sm" onClick={() => void bulk("restore")}>
                  <RotateCcw aria-hidden /> Restaurar
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void bulk("delete")}>
                  <Trash2 aria-hidden /> Excluir
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => void bulk("favorite")}>
                  <Star aria-hidden /> Favoritar
                </Button>
                <Button variant="outline" size="sm" onClick={() => void bulk("trash")}>
                  <Trash2 aria-hidden /> Mover para lixeira
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X aria-hidden /> Limpar selecao
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-56 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card className="border-destructive/40">
          <CardContent className="p-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Falha ao carregar a biblioteca."}
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm font-medium">{emptyTitle}</p>
            <p className="max-w-md text-sm text-muted-foreground">{emptyDescription}</p>
            <UploadButton />
          </CardContent>
        </Card>
      ) : view === "grid" ? (
        <>
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                setSelected(checked === true ? new Set(items.map((file) => file.id)) : new Set())
              }
              aria-label="Selecionar todos"
            />
            <span className="text-xs text-muted-foreground">Selecionar todos</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                thumbnailUrl={thumbnails[file.id]}
                selected={selected.has(file.id)}
                onSelect={(checked) => toggleSelected(file.id, checked)}
                onPreview={setPreviewFile}
                onEdit={setEditFile}
                onChanged={refresh}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-3 px-3 py-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                setSelected(checked === true ? new Set(items.map((file) => file.id)) : new Set())
              }
              aria-label="Selecionar todos"
            />
            <span className="text-xs text-muted-foreground">Selecionar todos</span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid-cols-[auto_44px_minmax(0,2fr)_minmax(0,1fr)_120px_150px_auto]">
            <span />
            <span className="hidden sm:block">Miniatura</span>
            <span>Nome</span>
            <span className="hidden sm:block">Tipo</span>
            <span className="hidden sm:block">Tamanho</span>
            <span className="hidden sm:block">{showStatus ? "Status" : "Criado em"}</span>
            <span />
          </div>
          {items.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              thumbnailUrl={thumbnails[file.id]}
              selected={selected.has(file.id)}
              onSelect={(checked) => toggleSelected(file.id, checked)}
              onPreview={setPreviewFile}
              onEdit={setEditFile}
              onChanged={refresh}
              showStatus={showStatus}
            />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
          >
            <ChevronLeft aria-hidden /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Pagina {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
          >
            Proxima <ChevronRight aria-hidden />
          </Button>
        </div>
      ) : null}

      {isFetching && !isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Atualizando...
        </div>
      ) : null}

      <FilePreviewDialog
        file={previewFile}
        files={items}
        onClose={() => setPreviewFile(null)}
        onChanged={refresh}
      />
      <FileEditDialog
        file={editFile}
        open={Boolean(editFile)}
        onOpenChange={(open) => !open && setEditFile(null)}
        onSaved={refresh}
      />
    </div>
  );
}
