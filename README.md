# Acervo Digital

Plataforma web de gestão de arquivos com inteligência artificial: biblioteca centralizada de
documentos, imagens, álbuns e vídeos, upload direto para armazenamento em nuvem com progresso real,
descoberta de conteúdo na internet e integrações com Google Drive, Telegram, provedores de IA e
de pesquisa.

![Next.js](https://img.shields.io/badge/Next.js-15-000) ![React](https://img.shields.io/badge/React-19-087ea4)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-000)

---

## 1. Funcionalidades

| Módulo | Descrição |
| --- | --- |
| **Autenticação** | Login/logout, recuperação de senha, troca obrigatória de senha no primeiro acesso, proteção de todas as rotas privadas |
| **Dashboard** | Totais reais (arquivos, espaço, documentos, imagens, vídeos, álbuns), uploads ativos/concluídos/falhos, distribuição por tipo e por provedor, arquivos recentes e mais pesados |
| **Biblioteca** | Grade e lista, busca por nome/tag/descrição, filtros (tipo, período, álbum, provedor, tamanho, favoritos, processamento), 8 ordenações, paginação no servidor, seleção múltipla e ações em lote |
| **Documentos** | TXT, MD, PDF, DOCX, RTF; upload em lote, pré-visualização no navegador (PDF nativo), extração de texto no servidor (txt/md/rtf/docx) com busca textual |
| **Imagens e Álbuns** | Álbuns com nome, descrição, capa, contagem e tags; upload direto para o álbum; grade responsiva, lightbox, mover imagens entre álbuns, exclusão sem apagar imagens (opção explícita) |
| **Vídeos** | MP4, MOV, WEBM; player HTML5 com controles, volume e tela cheia; miniaturas, metadados e filtros |
| **Uploads em tempo real** | Envio direto navegador→storage (PUT assinado ou multipart), progresso em bytes reais, velocidade, ETA, cancelamento, retentativa, retomada, controle de concorrência e histórico |
| **Salvar conteúdo** | Pesquisa por palavra-chave (provedor real configurado) e análise de URL (Open Graph, JSON-LD, oEmbed do YouTube, API oficial do X) com organização por IA e importação seletiva |
| **Favoritos / Lixeira** | Marcação, lixeira com restauração e exclusão definitiva com confirmação |
| **Integrações** | Cards com status real (conectado/desconectado/requer configuração), teste de conexão e configuração de Google Drive, S3/Wasabi, Telegram, IA e pesquisa |
| **Segurança** | RLS no Postgres, URLs assinadas com expiração, proteção SSRF, rate limiting, cabeçalhos de segurança, validação Zod, auditoria |

---

## 2. Arquitetura

```
src/
├── app/                    # App Router: páginas (server components) e Route Handlers
│   ├── (auth)/             # login, reset-password
│   ├── (app)/              # área autenticada (layout com sidebar + header)
│   ├── api/                # endpoints REST (auth, files, albums, uploads, imports, integrations…)
│   └── auth/callback/      # callback OAuth do Supabase
├── components/
│   ├── ui/                 # primitivos shadcn/ui (Radix + Tailwind v4)
│   ├── layout/             # sidebar, header, busca global, menu do usuário
│   └── theme/              # tema claro/escuro
├── features/               # funcionalidades: uploads, library, albums, save, settings, auth…
├── lib/
│   ├── auth/               # driver local + driver Supabase (fachada comum)
│   ├── db/                 # cliente SQL (postgres.js | PGlite) + repositórios
│   ├── storage/            # abstração: S3/Wasabi + driver local + chaves
│   ├── integrations/       # google-drive, telegram, ai, search, url-analysis, email
│   ├── security/           # ssrf, crypto, rate-limit
│   ├── content/            # extração de texto de documentos
│   └── validation/         # esquemas Zod e regras de tipo de arquivo
├── jobs/                   # processamento assíncrono (importação)
├── scripts/                # CLI: migrate, bootstrap-admin, seed-dev, check-storage
└── supabase/migrations/    # schema + RLS (SQL único para Postgres e PGlite)
```

**Decisões-chave**

- **Um único SQL, dois drivers**: `lib/db/client.ts` fala a mesma linguagem para
  `postgres.js` (Supabase/Neon) e **PGlite** (Postgres em WASM). As migrações são as mesmas,
  então o ambiente local reproduz o schema de produção — sem serviço externo para rodar.
- **RLS real**: o servidor define `app.user_id` em cada transação e alterna para o role
  `authenticated` quando ele existe; as policies comparam a linha com `app.current_user_id()`.
  Além disso, **todas** as queries filtram explicitamente por `user_id` (defesa em profundidade).
- **Upload sem passar pelo serverless**: o navegador recebe URL assinada (PUT) ou URLs de partes
  (multipart) e envia direto ao bucket. O arquivo só entra no acervo **após** a confirmação de
  persistência no storage (`headObject` + conferência de tamanho).
- **Storage abstrato**: `StorageProvider` define upload, multipart, URL assinada, download, cópia,
  exclusão, metadados, listagem e health check. Trocar de Wasabi para AWS S3 (ou R2/MinIO) não toca
  no resto do código.
- **Jobs duráveis**: uploads e importações têm tabelas de estado (`upload_sessions`, `import_jobs`,
  `import_candidates`), então o progresso sobrevive a navegação e recarregamentos.

---

## 3. Execução local (sem nenhuma credencial externa)

Pré-requisitos: Node.js ≥ 20.11.

```bash
npm install
cp .env.example .env.local     # opcional: os padrões já funcionam em dev
npm run dev
```

Sem `DATABASE_URL`, a aplicação sobe com **PGlite** (`.dev-data/pglite`) e o driver de storage em
disco (`.dev-storage`). As migrações são aplicadas automaticamente em desenvolvimento.

Criar a conta administrativa de demonstração:

```bash
# PowerShell
$env:BOOTSTRAP_ADMIN_EMAIL="admin@acervodigital.app"
$env:BOOTSTRAP_ADMIN_PASSWORD="N8!vQ4#rL7@xP2$kM9z"
npm run bootstrap:admin
```

> A conta é criada **uma única vez** (o bootstrap verifica se já existe um administrador) e a troca de
> senha é exigida no primeiro acesso. A senha nunca é gravada em texto puro: o driver local usa
> `scrypt`; o driver Supabase usa o mecanismo de hashing do Supabase Auth.

O login fica em <http://localhost:3000/login>.

Outros comandos úteis:

```bash
npm run migrate            # aplica migrações pendentes
npm run migrate:status     # lista aplicadas e pendentes
npm run seed:dev           # cria album + arquivo de exemplo
npm run storage:check      # testa o provedor de storage configurado
npm run test               # testes unitários e de integração (Vitest)
npm run test:e2e           # testes end-to-end (Playwright)
npm run lint && npm run typecheck
```

---

## 4. Variáveis de ambiente

Todas as variáveis estão documentadas em [`.env.example`](./.env.example). Resumo:

| Variável | Obrigatória | Onde |
| --- | --- | --- |
| `DATABASE_URL` | ✅ produção | Conexão Postgres (Supabase). Sem ela: PGlite local |
| `AUTH_DRIVER` | ✅ produção | `supabase` \| `local` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ com Supabase Auth | Autenticação |
| `SUPABASE_SERVICE_ROLE_KEY` | apenas para criar o admin | **Somente servidor** |
| `SESSION_SECRET` | ✅ | Assina cookies de sessão e tokens internos |
| `INTEGRATION_ENCRYPTION_KEY` | ✅ | Cifra (AES-256-GCM) segredos de integrações |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | opcional | Criação única do administrador |
| `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | ✅ produção | Wasabi/AWS S3 |
| `MAX_UPLOAD_SIZE`, `MULTIPART_PART_SIZE`, `SIGNED_URL_TTL` | opcional | Limites de upload |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | opcional | Integração Google Drive |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_DEFAULT_CHAT_ID` | opcional | Integração Telegram |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | opcional | Provedor de IA |
| `SEARCH_PROVIDER`, `BRAVE_SEARCH_API_KEY` / `TAVILY_API_KEY` / `SERPER_API_KEY` / `GOOGLE_CSE_*` | opcional | Provedor de pesquisa |
| `TWITTER_BEARER_TOKEN` | opcional | API oficial do X |
| `RATE_LIMIT_DRIVER`, `UPSTASH_REDIS_REST_*` | opcional | Rate limiting distribuído |

**Nenhum segredo é exposto ao navegador.** As chaves do S3, tokens OAuth, tokens do Telegram e a
chave de serviço do Supabase vivem apenas no servidor (variáveis de ambiente do Vercel) ou cifradas
no banco (`integrations`, `storage_providers`).

---

## 5. Implantação na Vercel

```bash
npm i -g vercel
vercel link
vercel env pull .env.local          # opcional
vercel env add DATABASE_URL production
vercel env add SESSION_SECRET production
vercel env add INTEGRATION_ENCRYPTION_KEY production
# ... demais variáveis
vercel deploy --prod
```

Depois do deploy:

1. `npm run migrate` (ou `vercel env pull` + `npm run migrate`) para aplicar o schema;
2. `npm run bootstrap:admin` para criar o administrador (ou defina `BOOTSTRAP_ADMIN_*` e faça o
   primeiro login — o bootstrap é idempotente);
3. Configure o cron de limpeza de uploads (já declarado em `vercel.json`).

Guia detalhado (Supabase, Wasabi, OAuth do Google, Telegram, IA, pesquisa, backup): **[docs/DEPLOY.md](./docs/DEPLOY.md)**.

---

## 6. Segurança

- **Autenticação e autorização no servidor** — o middleware apenas verifica a presença do cookie; a
  validação real acontece em cada layout e Route Handler.
- **RLS** no Postgres + escopo explícito por `user_id` em todas as queries.
- **URLs assinadas** de curta duração (padrão 10 min) para download e pré-visualização.
- **Proteção SSRF**: esquema, host, porta, resolução DNS e revalidação a cada redirect; IPs privados,
  loopback, link-local e metadata de nuvem são bloqueados.
- **Rate limiting** em login, recuperação de senha, uploads e busca.
- **Validação Zod** em todas as entradas, com MIME/extensão/tamanho verificados **no servidor**.
- **Auditoria** das ações relevantes (login, upload, exclusão, integrações) em `audit_logs`.
- Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy).

Detalhe em **[docs/SEGURANCA.md](./docs/SEGURANCA.md)**.

---

## 7. Limitações conhecidas

- **Sem transcodificação**: vídeos não são convertidos nem transmitidos em streaming adaptativo; a
  reprodução usa o arquivo original via URL assinada. Geração de miniaturas dedicado e
  transcodificação exigem um serviço externo (Mux, Cloudflare Stream, MediaConvert).
- **Persistência do upload em segundo plano**: o envio vive na aba do navegador. Ao recarregar a
  página, uploads interrompidos aparecem como "pausados" e podem ser reenviados (o envio recomeça do
  zero). A API do provedor permite retomar partes; a retomada automática exigiria persistir o
  `uploadId` no cliente.
- **Tamanho da imagem para o YouTube**: apenas a capa é importada (o download de vídeos de terceiros
  não é permitido pela plataforma).
- **Espaço total do bucket**: S3/Wasabi não expõe o uso do bucket em API padrão; o dashboard mostra o
  total do acervo (soma real dos metadados).
- **Rate limiting em memória** é por instância; use `RATE_LIMIT_DRIVER=upstash` com múltiplas regiões.
- **E-mail de recuperação**: sem `RESEND_API_KEY` o link é exibido no console em desenvolvimento.

---

## 8. Licença

Projeto entregue como base de produção —MIT.
