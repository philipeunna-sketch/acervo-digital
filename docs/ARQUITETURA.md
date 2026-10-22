# Arquitetura

## 1. Visão geral

```
Navegador
  │  (1) POST /api/uploads/initiate  ──────────────►  Servidor (Vercel)
  │  (2) PUT  <URL assinada>      ────────────────►  Wasabi / S3   (bytes não passam pelo serverless)
  │  (3) POST /api/uploads/:id/complete ─────────►  Servidor (headObject + grava metadados)
  │  (4) GET  <URL assinada temporária> ────────►  Wasabi / S3   (pré-visualização / download)
```

O binário **nunca** atravessa a função serverless em uploads do usuário. O backend só assina URLs,
valida metadados e registra o arquivo no Postgres.

## 2. Camadas

| Camada | Responsabilidade | Onde |
| --- | --- | --- |
| **Interface** | Server Components por padrão; Client Components apenas onde há estado/efeito | `src/app`, `src/features`, `src/components` |
| **Regras de negócio** | Regras de upload, importação, lixeira, favoritos | `src/features`, `src/jobs` |
| **Acesso a dados** | Repositórios com SQL parametrizado, sempre escopados por `user_id` | `src/lib/db/repo` |
| **Banco** | Postgres (Supabase) ou PGlite, schema + RLS | `src/lib/db`, `supabase/migrations` |
| **Armazenamento** | Abstração de objetos (S3/Wasabi e driver local) | `src/lib/storage` |
| **Autenticação** | Driver Supabase (produção) e driver local (dev) com a mesma fachada | `src/lib/auth` |
| **Integrações** | Google Drive, Telegram, IA, pesquisa, e-mail | `src/lib/integrations` |
| **Segurança** | SSRF, cripto, rate limit, cabeçalhos | `src/lib/security`, `next.config.ts` |

## 3. Modelo de dados

```
profiles ──< files ──< album_files >── albums
                 │  │
                 │  └──< file_tags >── tags
                 │
                 ├──< favorites >── (profiles)
                 ├──< upload_sessions
                 └──< import_candidates >── import_jobs

storage_providers  (provedores S3/local, credenciais cifradas)
integrations       (conexões por usuário: Drive, Telegram, IA, pesquisa — tokens cifrados)
audit_logs         (trilha de auditoria)
```

Regras de integridade:

- `files.user_id`, `albums.user_id`, `tags.user_id` → `profiles.id` com `ON DELETE CASCADE`.
- `album_files` e `file_tags` → tabelas de junção com chave primária composta.
- `favorites` → chave composta `(user_id, file_id)`.
- `files.status` (`active`, `processing`, `trashed`, `failed`) controla a lixeira **sem apagar a linha**;
  a exclusão definitiva remove a linha e o objeto do storage.
- `albums.cover_file_id` → `files.id` com `ON DELETE SET NULL`.
- Índices em `(user_id, created_at desc)`, `(user_id, status)`, `(user_id, category)`,
  `(user_id, size_bytes desc)`, GIN para busca textual e `files.storage_key`.

### RLS

`supabase/migrations/0002_rls.sql` habilita RLS em todas as tabelas e cria a função
`app.current_user_id()`, que lê `app.user_id` (definido pelo servidor em cada transação) ou
`request.jwt.claims`. As policies comparam a linha com o usuário atual; tabelas do driver local de
autenticação são inacessíveis via RLS (`using (false)`), pois só o servidor as usa.

No Supabase, o backend conecta com `DATABASE_URL` (role superuser) e executa
`set_config('role','authenticated', true)` dentro de cada transação de usuário — assim as policies
passam a valer exatamente como para um cliente autenticado.

## 4. Fluxos principais

### 4.1 Upload

1. `POST /api/uploads/initiate` valida nome, extensão, MIME e tamanho; cria `upload_sessions`;
   decide entre PUT único (≤ `MULTIPART_PART_SIZE`) e multipart.
2. O cliente recebe a URL assinada (ou o `uploadId` + tamanho de parte) e envia os bytes com XHR,
   medindo `upload.onprogress` → **progresso real em bytes**.
3. No multipart, as partes são pedidas em lotes (`POST /api/uploads/:id/parts`) e enviadas com
   concorrência limitada (3 por vez).
4. `POST /api/uploads/:id/complete` conclui o multipart, chama `headObject` e compara o tamanho
   gravado com o esperado. Só então o registro em `files` é criado.
5. Falha de persistência → sessão marcada como `failed`, sem registro no acervo.

### 4.2 Salvar conteúdo (importação)

1. `POST /api/imports/analyze` valida a URL (SSRF), identifica a origem e coleta as mídias
   realmente disponíveis (Open Graph, JSON-LD, tags de mídia, oEmbed do YouTube, API oficial do X).
2. A IA (quando configurada) **organiza** o que foi encontrado: tipo, nome, descrição, tags.
   Sem IA, heurísticas locais são usadas e a interface informa isso.
3. `POST /api/imports/commit` baixa as mídias selecionadas (fetch seguro, limite de tamanho), grava
   no storage escolhido e cria os registros em `files`, opcionalmente em um álbum.
4. `import_jobs`/`import_candidates` guardam o estado; a interface pode acompanhar o progresso.

### 4.3 Autenticação

- `AUTH_DRIVER=supabase` → `@supabase/ssr` com cookies httpOnly; `profiles` é sincronizada no
  primeiro acesso.
- `AUTH_DRIVER=local` → hash `scrypt` + sessão no banco + cookie assinado com HMAC.
- `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` criam o administrador **uma vez**; a conta fica
  com `must_change_password = true` e o layout redireciona para a troca obrigatória.

## 5. Estratégia de cache

- `dashboard/stats`, `files` e `uploads` são dinâmicos (`force-dynamic`): dados de usuário nunca são
  cacheados publicamente.
- O cliente usa TanStack Query com `staleTime` de 10–60 s para listas e invalidação explícita após
  mutações.
- URLs assinadas têm expiração curta e nunca são armazenadas em cache compartilhado.

## 6. Limites da Vercel e como a aplicação lida com eles

| Limite | Tratamento |
| --- | --- |
| Corpo da função (4,5 MB) | Uploads vão direto ao storage; o servidor só recebe metadados |
| Duração da função | Importações e uploads grandes usam `after()` (background) e tabelas de estado |
| Funções sem estado | Drivers com pool de conexões (postgres.js) e cache em `globalThis` |
| Filesystem efêmero | Nunca usado para arquivos: apenas o driver local de **desenvolvimento** |
| CPU de funções | Sem processamento pesado (nada de transcodificação ou antivírus síncrono) |
