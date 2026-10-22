# Operação, logs, backup e retenção

## 1. Logs

| Evento | Onde |
| --- | --- |
| Autenticação (sucesso/falha), logout | `audit_logs` + logs da plataforma |
| Upload iniciado/concluído/falhou | `audit_logs` + `upload_sessions.status` |
| Importação e candidatos | `import_jobs` / `import_candidates` + `audit_logs` |
| Exclusão definitiva | `audit_logs` (nome do arquivo e usuário) |
| Conexão/desconexão de integrações | `audit_logs` |
| Erros de runtime | `console.error` com prefixo do módulo (`[api]`, `[db]`, `[uploads]`, `[imports]`, `[audit]`) |

Regras:

- **Nunca** registre senhas, tokens, chaves ou o conteúdo dos arquivos.
- Erros devolvidos ao cliente são mensagens genéricas; o detalhe fica no log do servidor.
- Para ambientes Vercel, conecte o Log Drain a um agregador (Datadog, Axiom, Sentry).

## 2. Monitoramento

| Sinal | Como obter |
| --- | --- |
| Saúde da aplicação | `GET /api/system/health` → 200/503 com o estado de banco, storage e auth |
| Uploads com falha | `upload_sessions` com `status = 'failed'` (últimas 24 h) |
| Importações com falha | `import_jobs` com `status = 'failed'` |
| Erros de integração | `integrations.last_error` |
| Uso do acervo | `dashboard/stats` (totais reais) |

Alarmes recomendados:

- `health` respondendo 503 por > 2 min;
- taxa de `upload_sessions.failed` > 5 % em 1 h;
- `integrations.last_error` preenchido após teste de conexão.

## 3. Backup e recuperação

O acervo tem **duas** partes independentes. Faça backup das duas.

### 3.1 Metadados (Postgres)

Supabase: *Backups* no painel (PITR diário) ou dump manual:

```bash
pg_dump "$DATABASE_URL" --format=custom --file acervo-$(date +%F).dump
pg_restore --clean --if-exists acervo-2026-01-01.dump "$DATABASE_URL"
```

O schema também está em `supabase/migrations/*.sql`: uma base vazia pode ser reconstruída com
`npm run migrate` (os **dados** precisam do dump).

### 3.2 Objetos (Wasabi/S3)

- **Versioning** do bucket: habilite *Object versioning* e uma *lifecycle rule* para manter N versões.
- Replicação para outro bucket/região (Wasabi oferece *bucket replication*).
- Snapshots periódicos (Wasabi: *Snapshot*, cobrado por GB).

Restauração: os objetos mantêm a mesma chave; basta restaurar o dump do Postgres na mesma janela
temporal. Se as chaves mudarem, atualize `files.storage_key`.

### 3.3 Simulação

```bash
# 1. restaurar o banco
pg_restore --clean --if-exists backup.dump "$DATABASE_URL"
# 2. conferir integridade (contagens esperadas)
psql "$DATABASE_URL" -c "select count(*) from files where status='active';"
# 3. validar um objeto (deve retornar 200)
curl -I "https://s3.<regiao>.wasabisys.com/<bucket>/<chave>"
```

## 4. Retenção e exclusão

| Dado | Política padrão | Como alterar |
| --- | --- | --- |
| Arquivos na lixeira | Mantidos até exclusão manual | Usuário decide na tela *Lixeira* |
| Sessões de upload | Canceladas após 60 min sem atividade (cron horário) | `STALE_MINUTES` em `src/app/api/jobs/cleanup/route.ts` |
| `audit_logs` | Retenção de 180 dias (recomendado) | Job de limpeza ou política de particionamento |
| `import_jobs` / `import_candidates` | 90 dias (recomendado) | Idem |
| Objetos órfãos no bucket | Limpeza no job de manutenção | `scripts/cleanup-uploads.ts` |

> Não há expiração automática de arquivos do acervo: a lixeira é manual por decisão do usuário.

## 5. Manutenção de rotina

```bash
npm run migrate:status     # schema aplicado
npm run storage:check      # provedor acessível
npm run test               # suíte completa antes de deploy
```

Cron declarado em `vercel.json`:

```json
{ "path": "/api/jobs/cleanup", "schedule": "0 * * * *" }
```

Protegido por `CRON_SECRET` (header `authorization: Bearer <secret>`).

## 6. Escala

| Gargalo | Ajuste |
| --- | --- |
| Conexões com o Postgres | `DB_POOL_MAX` (padrão 10) por instância; use pooler transacional do Supabase |
| Upload de arquivos grandes | `MULTIPART_PART_SIZE` (16 MB) e `MULTIPART_MAX_PARTS` por lote |
| Linhas da biblioteca | Paginação no servidor + índices; nunca carregar tudo |
| Importações | Executam em background (`after()`) e cada item é independente |
| Rate limit distribuído | `RATE_LIMIT_DRIVER=upstash` |
