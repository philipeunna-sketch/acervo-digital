# Implantação

Guia passo a passo para levar o Acervo Digital à produção na Vercel.

---

## 1. Preparar o repositório

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## 2. Supabase (Postgres + Auth)

1. Crie um projeto em <https://supabase.com>.
2. **Database → Connection string**: copie a URL *pooler* (transacional, porta 6543) e a *direct*
   (porta 5432):

   ```bash
   DATABASE_URL=postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:6543/postgres
   DIRECT_URL=postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
   ```

3. **Authentication → URL Configuration**:
   - Site URL: `https://<seu-dominio>`
   - Redirect URLs: `https://<seu-dominio>/auth/callback` e `http://localhost:3000/auth/callback`
4. **Authentication → Providers → Email**: ative o login por e-mail/senha. Para uso real, desative
   "confirmar e-mail" ou habilite um provedor de e-mail (SMTP).
5. **API Settings**: copie `Project URL` (→ `NEXT_PUBLIC_SUPABASE_URL`), `anon public key`
   (→ `NEXT_PUBLIC_SUPABASE_ANON_KEY`) e `service_role` (→ `SUPABASE_SERVICE_ROLE_KEY`, **somente
   servidor**).

### Alternativa sem Supabase

Qualquer Postgres acessível funciona. Defina `DATABASE_URL` e mantenha `AUTH_DRIVER=local`
(driver de autenticação próprio, hash scrypt + sessão no banco).

---

## 3. Migrações

```bash
# com o .env.local apontando para o banco de produção
npm run migrate:status
npm run migrate
```

Ou pelo Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push            # aplica supabase/migrations/*.sql
```

O schema é idempotente (`create table if not exists`, `create index if not exists`).

> **RLS**: as policies de `0002_rls.sql` assumem que o servidor define `app.user_id` na transação.
> Se você permitir acesso direto do anon key ao Postgres, adicione as policies
> `auth.uid() = user_id` às tabelas correspondentes.

---

## 4. Armazenamento (Wasabi / S3)

1. Crie uma conta no Wasabi (<https://wasabi.com>) ou use AWS S3.
2. Crie um **bucket privado** (nunca habilite "public bucket").
3. Crie uma **access key** com permissão de escrita/leitura no bucket.
4. Configure o CORS do bucket para permitir o PUT a partir do seu domínio (necessário para o upload
   direto do navegador):

   ```json
   [
     {
       "AllowedOrigins": ["https://seu-dominio.com", "http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   > `ExposeHeaders: ["ETag"]` é importante: o cliente precisa do ETag de cada parte para
   > concluir o multipart upload.
5. Variáveis:

   ```bash
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://s3.<regiao>.wasabisys.com
   S3_REGION=<regiao>
   S3_BUCKET=acervo-digital
   S3_ACCESS_KEY_ID=<chave>
   S3_SECRET_ACCESS_KEY=<segredo>
   S3_FORCE_PATH_STYLE=true
   ```

6. Teste a conectividade: `npm run storage:check`.

Também é possível cadastrar provedores adicionais pela tela **Integrações → Wasabi/S3** (as
credenciais ficam cifradas no banco). O provedor marcado como "padrão" é o destino padrão dos
uploads e importações.

---

## 5. Primeiro administrador

```bash
BOOTSTRAP_ADMIN_EMAIL="admin@acervodigital.app" \
BOOTSTRAP_ADMIN_PASSWORD="N8!vQ4#rL7@xP2$kM9z" \
npm run bootstrap:admin
```

- O procedimento é **idempotente**: se já existir um administrador, nada é criado.
- A senha é armazenada apenas pelo mecanismo de autenticação (hash no driver local, Supabase Auth no
  driver Supabase) e a **troca é obrigatória no primeiro acesso** (`must_change_password`).
- Em produção, defina as variáveis `BOOTSTRAP_ADMIN_*` no ambiente da Vercel e faça o primeiro
  login: o bootstrap roda automaticamente no endpoint de login e na inicialização do layout.
- Remova `BOOTSTRAP_ADMIN_PASSWORD` do ambiente depois do primeiro acesso.

> Use um e-mail real se quiser receber as mensagens de recuperação de senha.

---

## 6. Google Drive (OAuth 2.0)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie (ou use) um projeto e ative a
   **Google Drive API**.
2. Configure a tela de consentimento OAuth (interno ou externo) e adicione o escopo
   `https://www.googleapis.com/auth/drive.readonly`.
3. Crie um **OAuth Client ID** do tipo *Web application*:
   - Authorized redirect URI: `https://<seu-dominio>/api/integrations/google-drive/callback`
   - Authorized JavaScript origins: `https://<seu-dominio>`
4. Variáveis:

   ```bash
   GOOGLE_DRIVE_ENABLED=true
   GOOGLE_CLIENT_ID=<client-id>
   GOOGLE_CLIENT_SECRET=<client-secret>
   GOOGLE_REDIRECT_URI=https://<seu-dominio>/api/integrations/google-drive/callback
   ```

5. Em **Integrações → Google Drive → Conectar**, o fluxo OAuth é iniciado. Os tokens (access e
   refresh) são cifrados com AES-256-GCM antes de serem gravados e renovados automaticamente.

---

## 7. Telegram (Bot API)

1. Fale com [@BotFather](https://t.me/BotFather) e crie um bot (`/newbot`) — você recebe o token.
2. Inicie uma conversa com o bot e envie uma mensagem (obrigatório para o bot poder falar com você).
3. Obtenha o `chat_id`:
   - envie `/start` ao bot e chame `https://api.telegram.org/bot<TOKEN>/getUpdates`;
   - ou use `TELEGRAM_DEFAULT_CHAT_ID` para um canal/grupo (o bot precisa ser administrador).
4. Preencha em **Integrações → Telegram** (o token é cifrado no banco) ou defina
   `TELEGRAM_BOT_TOKEN` e `TELEGRAM_DEFAULT_CHAT_ID` no ambiente.

Limites da Bot API: documentos até 50 MB, fotos até 10 MB, vídeos até 50 MB. O Telegram recebe uma
**cópia**; o arquivo original permanece no acervo.

---

## 8. Provedor de IA

A camada de abstração implementa o protocolo *chat completions* da OpenAI, compatível com OpenAI,
Groq, OpenRouter, Together, DeepSeek, Ollama e afins.

```bash
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Ou configure pela tela **Integrações → Inteligência artificial** (a chave é cifrada por usuário).
Sem IA configurada, o módulo *Salvar conteúdo* continua funcionando com heurísticas locais e informa
isso na interface.

---

## 9. Provedor de pesquisa

```bash
SEARCH_PROVIDER=brave        # brave | tavily | serper | google
BRAVE_SEARCH_API_KEY=...     # ou TAVILY_API_KEY / SERPER_API_KEY / GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID
```

Sem provedor configurado, a aba de pesquisa por palavra-chave explica o que falta — **nenhum
resultado fictício é exibido**.

---

## 10. Vercel

```bash
npm i -g vercel
vercel link
vercel env add DATABASE_URL production
vercel env add SESSION_SECRET production        # openssl rand -base64 48
vercel env add INTEGRATION_ENCRYPTION_KEY production   # openssl rand -hex 32
vercel env add AUTH_DRIVER production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# ... demais variáveis opcionais
vercel deploy --prod
```

Após o deploy:

1. rode as migrações (`npm run migrate` apontando para o banco de produção);
2. crie o administrador (`npm run bootstrap:admin`);
3. o cron de limpeza de uploads já está em `vercel.json` (`/api/jobs/cleanup`, a cada hora);
   defina `CRON_SECRET` para proteger o endpoint.

### Checklist de produção

- [ ] `SESSION_SECRET` e `INTEGRATION_ENCRYPTION_KEY` definidos e diferentes entre ambientes
- [ ] `SUPABASE_SERVICE_ROLE_KEY` **ausente** do `NEXT_PUBLIC_*`
- [ ] Bucket privado, CORS com `ExposeHeaders: ["ETag"]`
- [ ] `NEXT_PUBLIC_APP_URL` / `APP_URL` configurado (links de e-mail e OAuth)
- [ ] `RESEND_API_KEY` + `MAIL_FROM` (recuperação de senha)
- [ ] `RATE_LIMIT_DRIVER=upstash` + credenciais Upstash (múltiplas regiões)
- [ ] `MAX_UPLOAD_SIZE` compatível com a política do provedor
- [ ] Alarme configurado para o endpoint `/api/system/health`

---

## 11. Execução local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Sem `DATABASE_URL` → PGlite; sem `S3_*` → driver local em `.dev-storage`. Ambos podem ser
removidos com `rm -rf .dev-data .dev-storage`.
