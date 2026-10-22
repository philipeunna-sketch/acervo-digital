/**
 * Cria (ou atualiza) a conta administrativa inicial no servidor.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=admin@acervodigital.app \
 *   BOOTSTRAP_ADMIN_PASSWORD='N8!vQ4#rL7@xP2$kM9z' \
 *   npm run bootstrap:admin
 *
 * A conta e criada uma unica vez: se ja existir um administrador, o script
 * informa e nao recria nada. A senha e armazenada apenas pelo mecanismo de
 * autenticacao (hash scrypt no driver local / Supabase Auth no driver
 * Supabase) e a troca e obrigatoria no primeiro acesso.
 */
import { closeDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getEnv } from "@/lib/env";
import { getAuthAdapter } from "@/lib/auth/session";

async function main(): Promise<void> {
  const env = getEnv();

  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD) {
    console.error(
      "Defina BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD antes de executar este script.",
    );
    process.exit(1);
  }

  await runMigrations();
  const result = await ensureBootstrap();

  for (const message of result.messages) console.log(`[bootstrap] ${message}`);

  if (!result.adminCreated) {
    const adapter = getAuthAdapter();
    console.log(`[bootstrap] Driver de autenticacao: ${adapter.name}`);
    console.log(
      "[bootstrap] Nenhuma conta nova foi criada (ja existe administrador ou o bootstrap exige revisao manual).",
    );
  } else {
    console.log(
      `[bootstrap] Conta "${result.adminEmail}" criada. A troca de senha sera exigida no primeiro acesso.`,
    );
  }

  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
