# AGENTS.md — Acervo Digital

Orientações para agentes e desenvolvedores que trabalhem neste repositório.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 · Radix/shadcn-ui ·
TanStack Query · Zod · Supabase (Postgres + Auth) · AWS SDK v3 (S3/Wasabi) · PGlite (dev) ·
Vitest · Playwright · Vercel.

## Comandos

```bash
npm run dev            # servidor local (PGlite + storage em disco, sem credenciais)
npm run build          # build de produção
npm run lint           # ESLint
npm run typecheck      # tsc --noEmit
npm test               # Vitest (unitários + integração)
npm run test:e2e       # Playwright
npm run migrate        # aplica supabase/migrations/*.sql
npm run bootstrap:admin
```

## Regras do projeto

1. **Camadas**: interface (`app`, `features`, `components`) → regras (`features`, `jobs`) → dados
   (`lib/db/repo`) → storage/auth/integrações (`lib/*`). Nunca|accessa o banco fora de `lib/db`.
2. **Todo acesso a dados é escopado por `user_id`**. Use `withUser(user.id, (db) => ...)` nas rotas
   e mantenha o `WHERE user_id = $1` nos repositórios (defesa em profundidade em relação ao RLS).
3. **Segredos só no servidor**. Nada de `NEXT_PUBLIC_*` para credenciais; tokens de integração são
   cifrados com `encryptSecret` antes de ir para o banco.
4. **Upload nunca passa pelo serverless**: o cliente usa URL assinada (PUT ou multipart). O
   registro em `files` só é criado **após** `headObject` confirmar a persistência.
5. **Valide no servidor**: Zod + `isAllowedUpload` + `isMimeConsistent` + limite de tamanho.
6. **Qualquer fetch de URL externa** passa por `safeFetch` (proteção SSRF).
7. **Não use `any`** sem justificativa (o lint bloqueia). Prefira `unknown` + type guards.
8. **Textos e comentários em português**, sem acentos-opcionais inconsistentes: siga o estilo
   existente (código sem acentos, prosa com acentos quando natural).
9. **Padrões de UI**: tokens de cor do `globals.css` (`bg-background`, `text-muted-foreground`, …),
   `cn()` para classes, primitives em `components/ui`, features em `features/`.
10. **Acessibilidade**: `label` associado, `aria-invalid`/`aria-describedby` nos erros, foco
    visível, alvos de clique ≥ 44 px.

## Migrações

- Arquivos em `supabase/migrations/*.sql`, aplicados em ordem lexicográfica.
- Devem ser **idempotentes** e compatíveis com **PGlite** (dev) e **Postgres/Supabase** (prod).
- RLS em arquivo separado (`0002_rls.sql`), usando `app.current_user_id()`.
- Após alterar o schema: `npm run migrate` e `npm test`.

## Testes

- Unitários: `tests/unit` (SSRF, cripto, validação, chaves de storage, análise de URL).
- Integração: `tests/integration` (repositórios sobre PGlite com as migrações reais, driver local de
  storage).
- E2E: `tests/e2e` (Playwright, sobe o dev server com o driver local).

## Deploy

Ver `docs/DEPLOY.md`. Nunca versione `.env`; use as variáveis da Vercel.
