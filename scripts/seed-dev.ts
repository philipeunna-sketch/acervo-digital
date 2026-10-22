/**
 * Cria um album e um arquivo de exemplo no ambiente local (PGlite).
 * Util para validar a aplicacao sem credenciais externas.
 *
 *   npm run seed:dev
 */
import { closeDb, readyDb, withUser } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { createAlbum } from "@/lib/db/repo/albums";
import { insertFile } from "@/lib/db/repo/files";
import { LocalStorageProvider } from "@/lib/storage/local";
import { buildStorageKey } from "@/lib/storage/keys";

async function main(): Promise<void> {
  await runMigrations();
  const db = await readyDb();

  const rows = await db.query<{ id: string; email: string }>(
    `select id, email from public.profiles order by created_at asc limit 1`,
  );
  const user = rows[0];
  if (!user) {
    console.error("Nenhum usuario encontrado. Rode `npm run bootstrap:admin` antes.");
    process.exit(1);
  }

  const provider = new LocalStorageProvider({ name: "Seed (dev)" });
  const key = buildStorageKey(user.id, "exemplo.txt");
  await provider.putObject({
    key,
    body: new TextEncoder().encode("Arquivo de exemplo criado pelo seed de desenvolvimento.\n"),
    contentType: "text/plain",
    contentLength: 60,
  });

  await withUser(user.id, async (tx) => {
    const album = await createAlbum(tx, user.id, { name: "Album de exemplo" });
    const file = await insertFile(tx, {
      userId: user.id,
      name: "exemplo.txt",
      originalName: "exemplo.txt",
      extension: "txt",
      mimeType: "text/plain",
      sizeBytes: 60,
      category: "document",
      providerId: null,
      providerKind: "local",
      storageKey: key,
      description: "Arquivo criado pelo seed de desenvolvimento.",
    });
    console.log(`Usuario: ${user.email}`);
    console.log(`Album criado: ${album.name} (${album.id})`);
    console.log(`Arquivo criado: ${file.name} (${file.id})`);
  });

  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
