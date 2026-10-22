/**
 * CLI de migracoes do banco de dados.
 *
 *   npm run migrate           -> aplica as migracoes pendentes
 *   npm run migrate:status    -> lista aplicadas e pendentes
 */
import { closeDb } from "@/lib/db/client";
import { migrationStatus, runMigrations } from "@/lib/db/migrate";

async function main(): Promise<void> {
  const status = process.argv.includes("--status");
  if (status) {
    const result = await migrationStatus();
    console.log("Migracoes aplicadas:");
    for (const m of result.applied) console.log(`  - ${m.id} (${m.applied_at})`);
    console.log("Migracoes pendentes:");
    for (const m of result.pending) console.log(`  - ${m.id}`);
    if (result.pending.length === 0) console.log("  (nenhuma)");
  } else {
    const result = await runMigrations();
    console.log(`Aplicadas: ${result.applied.length} | Ja existentes: ${result.skipped.length}`);
  }
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
