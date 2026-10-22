# Segurança

## 1. Controles implementados

### Autenticação e sessão

| Controle | Implementação |
| --- | --- |
| Sessão segura | Cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, assinado com HMAC (driver local) ou gerenciado pelo `@supabase/ssr` |
| Senhas | `scrypt` (N=16384, r=8, p=1) com salt aleatório por usuário, ou Supabase Auth |
| Sessões revogáveis | Tabela `local_sessions` — troca de senha ou logout apaga todas as sessões do usuário |
| Conta inicial | Criada uma única vez pelo bootstrap; `must_change_password` bloqueia o app até a troca |
| Rate limit de login | 10 tentativas / 5 min por IP (`/api/auth/login`) |
| Recuperação de senha | Resposta genérica (não revela se o e-mail existe) + rate limit próprio |

### Autorização e isolamento de dados

- Toda rota privada exige sessão (`getCurrentUser()` no servidor) e todas as rotas de API verificam
  `requireUser` antes de tocar o banco.
- **Row Level Security** no Postgres (`supabase/migrations/0002_rls.sql`): cada tabela é filtrada por
  `app.current_user_id()`.
- **Escopo explícito por `user_id`** em todas as queries dos repositórios (defesa em profundidade,
  inclusive no driver PGlite de desenvolvimento).
- O navegador **nunca** acessa o Postgres: a `service_role` do Supabase, as chaves S3, os tokens
  OAuth e do Telegram vivem apenas no servidor.

### Arquivos privados

- O bucket é privado; o navegador só recebe **URLs assinadas** com expiração (padrão: 10 min,
  máximo: 60 min).
- A URL de download é gerada no servidor após checar a posse do arquivo.
- `Content-Disposition: attachment` para downloads; `inline` para pré-visualização.

### Validação de entrada

- **Zod** em todos os corpos de requisição (`src/lib/validation/schemas.ts`).
- **MIME × extensão × tamanho** verificados no servidor (`isAllowedUpload`, `isMimeConsistent`,
  `MAX_UPLOAD_SIZE`), independentemente do que o navegador informa.
- Nomes de arquivo são sanitizados (`sanitizeFileName`) e as chaves de storage são geradas pelo
  servidor (`buildStorageKey`), impedindo path traversal.

### SSRF

`src/lib/security/ssrf.ts` implementa:

- allowlist de esquemas (`http`, `https`);
- rejeição de credenciais na URL;
- bloqueio de `localhost`, `*.localhost`, `*.local`, `*.internal`, `metadata.google.internal`;
- allowlist de portas (80/443 + `FETCH_ALLOWED_PORTS`);
- resolução DNS com bloqueio de IPs privados, loopback, link-local (incl. `169.254.169.254`),
  CGNAT, multicast e reservados (IPv4 e IPv6, incluindo IPv4-mapped);
- **revalidação a cada redirect** (máx. 3), com timeout e limite de tamanho do corpo.

### Rate limiting

`src/lib/security/rate-limit.ts` — janela deslizante em memória (padrão) ou Upstash REST
(produção multi-instância). Aplicado em login, recuperação de senha, uploads, busca, análise de URL e
importação.

### Cabeçalhos e transporte

`next.config.ts` define CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` e remove o header `X-Powered-By`.

### Segredos

| Segredo | Onde vive |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY`, `S3_SECRET_ACCESS_KEY`, tokens OAuth/Telegram (variáveis de ambiente) | Somente no servidor (Vercel) |
| Segredos cadastrados pela UI (Telegram, IA, pesquisa, S3) | Cifrados com AES-256-GCM (`INTEGRATION_ENCRYPTION_KEY`) em `integrations` / `storage_providers` |
| Senhas (driver local) | `scrypt` + salt em `local_users` |

`NEXT_PUBLIC_*` contém apenas URL pública do Supabase e a anon key (que, isoladamente, não concede
acesso a dados — o RLS e o servidor protegem o acervo).

### Auditoria

`audit_logs` registra login (sucesso/falha), logout, criação de álbum, upload iniciado/concluído,
exclusão, importação, alterações de senha e conexões de integrações. Nunca são gravadas credenciais
nem o conteúdo dos arquivos.

### Acessibilidade

HTML semântico, `label` associado a todos os campos, `aria-invalid` + `aria-describedby` nos erros,
foco visível (`:focus-visible`), navegação por teclado, `aria-label` nos botões de ícone e contraste
compatível com WCAG AA.

---

## 2. O que **não** está implementado (e como habilitar)

| Item | Situação | Como habilitar |
| --- | --- | --- |
| Antivírus | Não implementado (scanning síncrono não cabe em função serverless) | Integrar um serviço assíncrono (ClamAV em container, Cloudmersive, Lambda) após o `complete` do upload |
| 2FA / MFA | Não implementado | Supabase Auth já suporta TOTP; ative em *Authentication → MFA* |
| Verificação de e-mail | Depende do provedor | Ative "Confirm email" no Supabase ou configure SMTP |
| Recuperação de senha por e-mail | Requer provedor de e-mail | Defina `RESEND_API_KEY` e `MAIL_FROM` |
| WAF / DDoS | Fornecido pela Vercel | Configure rate limiting por rota e firewall no provedor |
| Criptografia do bucket | Fornecida pelo provedor | Ative SSE-KMS no Wasabi/S3 |

---

## 3. Checklist antes de ir para produção

1. Trocar `SESSION_SECRET` e `INTEGRATION_ENCRYPTION_KEY` (valores diferentes entre dev e prod).
2. Remover `BOOTSTRAP_ADMIN_PASSWORD` do ambiente após o primeiro acesso.
3. Bucket privado + CORS com `ExposeHeaders: ["ETag"]` e origem restrita ao domínio.
4. `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente do servidor.
5. `RATE_LIMIT_DRIVER=upstash` se houver múltiplas regiões.
6. `CRON_SECRET` definido (protege `/api/jobs/cleanup`).
7. Verificar `npm run lint && npm run typecheck && npm run test && npm run build`.
8. Alarme para `GET /api/system/health` (retorna 503 em falha).
9. Política de retenção definida (ver `docs/OPERACAO.md`).
