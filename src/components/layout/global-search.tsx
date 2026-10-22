"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, FolderOpen, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/utils/format";
import type { FileRecord, AlbumRecord } from "@/types";

interface SearchResponse {
  files: FileRecord[];
  albums: AlbumRecord[];
}

export function GlobalSearch(): React.JSX.Element {
  const router = useRouter();
  const [term, setTerm] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", term],
    queryFn: async (): Promise<SearchResponse> => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (!response.ok) return { files: [], albums: [] };
      return (await response.json()) as SearchResponse;
    },
    enabled: term.trim().length >= 2,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        containerRef.current?.querySelector("input")?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = (href: string): void => {
    setOpen(false);
    setTerm("");
    router.push(href);
  };

  const hasResults = (data?.files.length ?? 0) + (data?.albums.length ?? 0) > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs sm:max-w-sm">
      <label htmlFor="global-search" className="sr-only">
        Pesquisar no acervo
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id="global-search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Pesquisar acervo..."
        className="h-9 pl-8"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
      />

      {open && term.trim().length >= 2 ? (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          {isFetching ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Pesquisando...
            </div>
          ) : !hasResults ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhum resultado para &quot;{term}&quot;.
            </p>
          ) : (
            <>
              {data?.albums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => go(`/imagens/${album.id}`)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{album.name}</span>
                  <span className="text-xs text-muted-foreground">{album.file_count}</span>
                </button>
              ))}
              {data?.files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => go(`/biblioteca?arquivo=${file.id}`)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</span>
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
