import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Prepara o ambiente de testes. Nenhuma variavel de ambiente real (producao)
 * pode vazar para os testes.
 */
// `NODE_ENV` e declarado somente leitura nos tipos do Node.
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.AUTH_DRIVER = "local";
process.env.STORAGE_DRIVER = "local";
process.env.SESSION_SECRET = "test-secret-session-key-0123456789";
process.env.INTEGRATION_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.LOCAL_STORAGE_SIGNING_SECRET =
  "test-local-storage-secret-0123456789";
process.env.BOOTSTRAP_ADMIN_EMAIL = "";
process.env.BOOTSTRAP_ADMIN_PASSWORD = "";
process.env.DATABASE_URL = "";

const { resetEnvCache } = await import("@/lib/env");
const { resetDbCaches } = await import("@/lib/db/client");

resetEnvCache();
resetDbCaches();

/**
 * Cada arquivo de teste roda em um banco PGlite isolado (em disco temporario).
 * As migracoes reais do projeto sao aplicadas, garantindo que o schema
 * testado e o mesmo de producao.
 */
process.env.PGLITE_DIR = await mkdtemp(path.join(tmpdir(), "acervo-test-"));

export const TEST_STORAGE_ROOT = path.join(
  tmpdir(),
  `acervo-storage-${process.pid}-${Date.now()}`,
);
