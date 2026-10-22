"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Cloud,
  FolderSync,
  Loader2,
  Plug,
  Search,
  Sparkles,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { integrationsApi } from "@/features/files/api";
import { formatDate } from "@/lib/utils/format";

interface IntegrationStatus {
  configured: boolean;
  connected: boolean;
  status: "connected" | "disconnected" | "requires_config";
  accountLabel?: string | null;
  accountEmail?: string | null;
  lastTestedAt?: string | null;
  lastError?: string | null;
  model?: string | null;
  provider?: string | null;
  redirectUri?: string | null;
  scopes?: string | null;
  providers?: Array<{
    id: string;
    name: string;
    kind: string;
    endpoint: string | null;
    region: string | null;
    bucket: string | null;
    isDefault: boolean;
    lastTestedAt: string | null;
    lastError: string | null;
  }>;
  available?: Array<{ id: string; label: string; configured: boolean }>;
}

export function IntegrationsView(): React.JSX.Element {
  const [busy, setBusy] = React.useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: integrationsApi.status as () => Promise<Record<string, IntegrationStatus>>,
    staleTime: 30_000,
  });

  const [telegramToken, setTelegramToken] = React.useState("");
  const [telegramChat, setTelegramChat] = React.useState("");
  const [aiProvider, setAiProvider] = React.useState("openai");
  const [aiKey, setAiKey] = React.useState("");
  const [aiModel, setAiModel] = React.useState("gpt-4o-mini");
  const [aiBaseUrl, setAiBaseUrl] = React.useState("https://api.openai.com/v1");
  const [searchProvider, setSearchProvider] = React.useState("brave");
  const [searchKey, setSearchKey] = React.useState("");
  const [storageName, setStorageName] = React.useState("Wasabi");
  const [storageEndpoint, setStorageEndpoint] = React.useState("");
  const [storageRegion, setStorageRegion] = React.useState("us-east-1");
  const [storageBucket, setStorageBucket] = React.useState("");
  const [storageKeyId, setStorageKeyId] = React.useState("");
  const [storageSecret, setStorageSecret] = React.useState("");

  const call = async (id: string, url: string, body?: unknown): Promise<void> => {
    setBusy(id);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? `Falha (${response.status})`);
      }
      toast.success("Operacao concluida.");
      void refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha na operacao.");
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (status?: string): React.JSX.Element => {
    if (status === "connected") {
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" aria-hidden /> Conectado
        </Badge>
      );
    }
    if (status === "requires_config") {
      return (
        <Badge variant="warning">
          <AlertCircle className="h-3 w-3" aria-hidden /> Requer configuracao
        </Badge>
      );
    }
    return <Badge variant="secondary">Desconectado</Badge>;
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-56 w-full" />
        ))}
      </div>
    );
  }

  const drive = data?.googleDrive;
  const storage = data?.storage;
  const telegram = data?.telegram;
  const ai = data?.ai;
  const search = data?.search;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integracoes</h1>
        <p className="text-sm text-muted-foreground">
          Conecte servicos externos. O status abaixo reflete a configuracao real do ambiente e da sua conta.
        </p>
      </header>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderSync className="h-4 w-4" aria-hidden /> Google Drive
            </CardTitle>
            <CardDescription>Importa arquivos do Google Drive para o acervo via API oficial (OAuth 2.0).</CardDescription>
          </div>
          {statusBadge(drive?.status)}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {drive?.connected
              ? `Conectado como ${drive.accountEmail ?? drive.accountLabel ?? "conta do Google"}.`
              : drive?.configured
                ? "Autorize o acesso para listar e importar arquivos."
                : "Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no ambiente para habilitar."}
          </p>
          {drive?.redirectUri ? (
            <p className="text-xs text-muted-foreground">URI de redirecionamento: {drive.redirectUri}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" disabled={!drive?.configured}>
              <a href="/api/integrations/google-drive/authorize">
                <Plug aria-hidden /> Conectar
              </a>
            </Button>
            <Button
              variant="ghost"
              onClick={() => void call("drive-disconnect", "/api/integrations/google-drive/disconnect")}
              disabled={!drive?.connected}
            >
              <Unplug aria-hidden /> Desconectar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cloud className="h-4 w-4" aria-hidden /> Wasabi / S3
            </CardTitle>
            <CardDescription>Armazenamento de objetos compativel com S3 (Wasabi, AWS S3, R2, MinIO).</CardDescription>
          </div>
          {statusBadge(storage?.status)}
        </CardHeader>
        <CardContent className="space-y-4">
          {(storage?.providers ?? []).length > 0 ? (
            <ul className="space-y-2">
              {(storage?.providers ?? []).map((provider) => (
                <li
                  key={provider.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{provider.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {provider.kind} · {provider.endpoint ?? "endpoint padrao"} · {provider.bucket ?? "sem bucket"}
                  </span>
                  {provider.isDefault ? <Badge variant="info">Padrao</Badge> : null}
                  {provider.lastError ? (
                    <span className="text-xs text-destructive">{provider.lastError}</span>
                  ) : null}
                  <div className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void call("storage-test", `/api/integrations/storage/test?providerId=${provider.id}`)}
                      disabled={busy === "storage-test"}
                    >
                      Testar
                    </Button>
                    {!provider.isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void call("storage-default", `/api/integrations/storage/default?providerId=${provider.id}`)
                        }
                        disabled={busy === "storage-default"}
                      >
                        Tornar padrao
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum provedor cadastrado.</p>
          )}

          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Adicionar provedor S3</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s3-name">Nome</Label>
                <Input id="s3-name" value={storageName} onChange={(event) => setStorageName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-endpoint">Endpoint</Label>
                <Input
                  id="s3-endpoint"
                  value={storageEndpoint}
                  onChange={(event) => setStorageEndpoint(event.target.value)}
                  placeholder="https://s3.us-east-1.wasabisys.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-region">Regiao</Label>
                <Input id="s3-region" value={storageRegion} onChange={(event) => setStorageRegion(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-bucket">Bucket</Label>
                <Input id="s3-bucket" value={storageBucket} onChange={(event) => setStorageBucket(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-key">Access Key ID</Label>
                <Input id="s3-key" value={storageKeyId} onChange={(event) => setStorageKeyId(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-secret">Secret Access Key</Label>
                <Input
                  id="s3-secret"
                  type="password"
                  value={storageSecret}
                  onChange={(event) => setStorageSecret(event.target.value)}
                />
              </div>
            </div>
            <Button
              className="mt-3"
              size="sm"
              onClick={() =>
                void call("storage-save", "/api/integrations/storage/save", {
                  name: storageName,
                  kind: "s3",
                  endpoint: storageEndpoint,
                  region: storageRegion,
                  bucket: storageBucket,
                  accessKeyId: storageKeyId,
                  secretAccessKey: storageSecret,
                  forcePathStyle: true,
                })
              }
              disabled={busy === "storage-save"}
            >
              Salvar provedor
            </Button>
          </details>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" aria-hidden /> Telegram
            </CardTitle>
            <CardDescription>
              Envia copias de arquivos do acervo para um chat autorizado via Telegram Bot API (nao substitui o storage).
            </CardDescription>
          </div>
          {statusBadge(telegram?.status)}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tg-token">Token do bot</Label>
              <Input
                id="tg-token"
                type="password"
                value={telegramToken}
                onChange={(event) => setTelegramToken(event.target.value)}
                placeholder="123456:ABC-DEF..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tg-chat">Chat de destino</Label>
              <Input
                id="tg-chat"
                value={telegramChat}
                onChange={(event) => setTelegramChat(event.target.value)}
                placeholder="@meu_bot ou -1001234567890"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                void call("tg-save", "/api/integrations/telegram/save", {
                  botToken: telegramToken,
                  chatId: telegramChat,
                })
              }
              disabled={busy === "tg-save" || !telegramToken || !telegramChat}
            >
              Salvar e validar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void call("tg-test", "/api/integrations/telegram/test")}
              disabled={busy === "tg-test"}
            >
              Testar conexao
            </Button>
          </div>
          {telegram?.lastError ? <p className="text-xs text-destructive">{telegram.lastError}</p> : null}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" aria-hidden /> Inteligencia artificial
            </CardTitle>
            <CardDescription>
              Organiza metadados, classifica midias, gera descricoes e sugere tags. Configuravel por ambiente ou por
              usuario.
            </CardDescription>
          </div>
          {statusBadge(ai?.status)}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-provider">Provedor</Label>
              <Select value={aiProvider} onValueChange={setAiProvider}>
                <SelectTrigger id="ai-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="together">Together</SelectItem>
                  <SelectItem value="ollama">Ollama (local)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-model">Modelo</Label>
              <Input id="ai-model" value={aiModel} onChange={(event) => setAiModel(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-base">URL base</Label>
              <Input id="ai-base" value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-key">Chave da API</Label>
              <Input id="ai-key" type="password" value={aiKey} onChange={(event) => setAiKey(event.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                void call("ai-save", "/api/integrations/ai/save", {
                  provider: aiProvider,
                  apiKey: aiKey,
                  baseUrl: aiBaseUrl,
                  model: aiModel,
                })
              }
              disabled={busy === "ai-save" || !aiKey}
            >
              Salvar e testar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void call("ai-test", "/api/integrations/ai/test")}
              disabled={busy === "ai-test"}
            >
              Testar conexao
            </Button>
          </div>
          {ai?.lastError ? <p className="text-xs text-destructive">{ai.lastError}</p> : null}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" aria-hidden /> Provedor de pesquisa
            </CardTitle>
            <CardDescription>
              Alimenta a pesquisa por palavra-chave do modulo Salvar conteudo com resultados reais.
            </CardDescription>
          </div>
          {statusBadge(search?.status)}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="search-provider">Provedor</Label>
              <Select value={searchProvider} onValueChange={setSearchProvider}>
                <SelectTrigger id="search-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(search?.available ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                      {item.configured ? " (ambiente)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="search-key">Chave da API</Label>
              <Input
                id="search-key"
                type="password"
                value={searchKey}
                onChange={(event) => setSearchKey(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                void call("search-save", "/api/integrations/search/save", {
                  provider: searchProvider,
                  apiKey: searchKey,
                })
              }
              disabled={busy === "search-save" || !searchKey}
            >
              Salvar e testar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void call("search-test", "/api/integrations/search/test")}
              disabled={busy === "search-test"}
            >
              Testar conexao
            </Button>
          </div>
          {search?.lastError ? <p className="text-xs text-destructive">{search.lastError}</p> : null}
          {search?.lastTestedAt ? (
            <p className="text-xs text-muted-foreground">Ultimo teste: {formatDate(search.lastTestedAt)}</p>
          ) : null}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        {busy ? <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Credenciais ficam cifradas (AES-256-GCM) no banco e nunca sao expostas ao navegador. Provedores configurados
        por variavel de ambiente sao usados como padrao.
      </p>
    </div>
  );
}
