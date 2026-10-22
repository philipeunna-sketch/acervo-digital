import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { closeDb, readyDb, withUser, type Db } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import {
  createAlbum,
  listAlbums,
  albumFiles,
  addFilesToAlbum,
} from "@/lib/db/repo/albums";
import {
  getFile,
  insertFile,
  listFiles,
  moveToTrash,
  restoreFromTrash,
  setFavorite,
  setFileAlbums,
  listFavorites,
} from "@/lib/db/repo/files";
import { setFileTags, listFileTags, normalizeTags } from "@/lib/db/repo/tags";
import {
  createUploadSession,
  updateUploadSession,
  getUploadSession,
} from "@/lib/db/repo/uploads";
import { dashboardStats } from "@/lib/db/repo/stats";

let db: Db;

const USER_A = randomUUID();
const USER_B = randomUUID();

async function seedUser(userId: string, email: string): Promise<void> {
  await db.query(
    `insert into public.profiles (id, email, role) values ($1, $2, 'user') on conflict (id) do nothing`,
    [userId, email],
  );
}

async function insertSampleFile(
  userId: string,
  name: string,
  size = 1024,
): Promise<string> {
  const file = await insertFile(db, {
    userId,
    name,
    originalName: name,
    extension: name.split(".").pop() ?? null,
    mimeType: "text/plain",
    sizeBytes: size,
    category: "document",
    providerId: null,
    providerKind: "local",
    storageKey: `${userId}/${name}`,
  });
  return file.id;
}

beforeAll(async () => {
  db = await readyDb();
  await runMigrations();
  await seedUser(USER_A, "a@acervo.test");
  await seedUser(USER_B, "b@acervo.test");
}, 180_000);

describe("repositorio de arquivos", () => {
  it("lista apenas os arquivos do proprio usuario", async () => {
    const idA = await insertSampleFile(USER_A, "relatorio-a.txt");
    const idB = await insertSampleFile(USER_B, "relatorio-b.txt");

    const listA = await listFiles(db, USER_A, {});
    expect(listA.items.map((file) => file.id)).toContain(idA);
    expect(listA.items.map((file) => file.id)).not.toContain(idB);

    const listB = await listFiles(db, USER_B, {});
    expect(listB.items.map((file) => file.id)).toContain(idB);
    expect(listB.items.map((file) => file.id)).not.toContain(idA);
  });

  it("nao permite ler arquivo de outro usuario", async () => {
    const idB = await insertSampleFile(USER_B, "privado-b.txt");
    await expect(getFile(db, USER_A, idB)).resolves.toBeNull();
  });

  it("aplica filtros por texto, categoria e tamanho", async () => {
    await insertSampleFile(USER_A, "nota-importante.txt", 10);
    await insertSampleFile(USER_A, "grande.bin", 5000);

    const byName = await listFiles(db, USER_A, { q: "importante" });
    expect(byName.items).toHaveLength(1);
    expect(byName.items[0]?.name).toBe("nota-importante.txt");

    const bySize = await listFiles(db, USER_A, { minSize: 4000 });
    expect(bySize.items.every((file) => file.size_bytes >= 4000)).toBe(true);

    const byCategory = await listFiles(db, USER_A, { category: "document" });
    expect(byCategory.total).toBeGreaterThan(0);
  });

  it("ordena por tamanho decrescente", async () => {
    const list = await listFiles(db, USER_A, {
      sort: "size_desc",
      category: "document",
    });
    const sizes = list.items.map((file) => file.size_bytes);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it("move para a lixeira e restaura", async () => {
    const id = await insertSampleFile(USER_A, "lixeira.txt");
    expect(await moveToTrash(db, USER_A, [id])).toBe(1);
    expect((await getFile(db, USER_A, id))?.status).toBe("trashed");
    expect(await restoreFromTrash(db, USER_A, [id])).toBe(1);
    expect((await getFile(db, USER_A, id))?.status).toBe("active");
  });

  it("gerencia favoritos por usuario", async () => {
    const id = await insertSampleFile(USER_A, "favorito.txt");
    await setFavorite(db, USER_A, id, true);
    expect((await listFavorites(db, USER_A)).map((file) => file.id)).toContain(
      id,
    );
    expect(
      (await listFavorites(db, USER_B)).map((file) => file.id),
    ).not.toContain(id);
  });

  it("grava e normaliza tags", async () => {
    const id = await insertSampleFile(USER_A, "com-tags.txt");
    await setFileTags(db, USER_A, id, ["Projeto", " projeto ", "2026"]);
    const tags = await listFileTags(db, USER_A, id);
    expect(tags.map((tag) => tag.name).sort()).toEqual(["2026", "projeto"]);
    expect(normalizeTags(["A", "a", "B "])).toEqual(["a", "b"]);
  });
});

describe("albums", () => {
  it("cria album e vincula arquivos do mesmo usuario", async () => {
    const album = await createAlbum(db, USER_A, { name: "Viagem" });
    const fileId = await insertSampleFile(USER_A, "foto.png");

    expect(await addFilesToAlbum(db, USER_A, album.id, [fileId])).toBe(1);
    const files = await albumFiles(db, USER_A, album.id);
    expect(files.items.map((file) => file.id)).toContain(fileId);

    const albums = await listAlbums(db, USER_A);
    expect(albums.map((item) => item.id)).toContain(album.id);
    expect((await listAlbums(db, USER_B)).map((item) => item.id)).not.toContain(
      album.id,
    );
  });

  it("nao vincula arquivo de outro usuario ao album", async () => {
    const album = await createAlbum(db, USER_A, { name: "Isolado" });
    const fileB = await insertSampleFile(USER_B, "alheio.png");
    expect(await addFilesToAlbum(db, USER_A, album.id, [fileB])).toBe(0);
  });

  it("remove o vinculo sem apagar o arquivo", async () => {
    const album = await createAlbum(db, USER_A, { name: "Temporario" });
    const fileId = await insertSampleFile(USER_A, "temp.txt");
    await addFilesToAlbum(db, USER_A, album.id, [fileId]);
    await setFileAlbums(db, USER_A, fileId, []);
    expect((await albumFiles(db, USER_A, album.id)).items).toHaveLength(0);
    expect(await getFile(db, USER_A, fileId)).not.toBeNull();
  });
});

describe("sessoes de upload", () => {
  it("cria e atualiza a sessao com bytes enviados", async () => {
    const session = await createUploadSession(db, {
      userId: USER_A,
      fileName: "video.mp4",
      sizeBytes: 1000,
      mimeType: "video/mp4",
      providerId: null,
      storageKey: `${USER_A}/video.mp4`,
      multipartUploadId: "upload-1",
      partSize: 500,
      status: "uploading",
    });

    expect(session.status).toBe("uploading");
    await updateUploadSession(db, USER_A, session.id, {
      status: "completed",
      uploadedBytes: 1000,
      fileId: null,
    });

    const updated = await getUploadSession(db, USER_A, session.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.uploaded_bytes).toBe(1000);
  });

  it("nao expoe a sessao de outro usuario", async () => {
    const session = await createUploadSession(db, {
      userId: USER_A,
      fileName: "privado.mp4",
      sizeBytes: 10,
      mimeType: "video/mp4",
      providerId: null,
      storageKey: `${USER_A}/privado.mp4`,
      multipartUploadId: null,
      partSize: null,
    });
    await expect(getUploadSession(db, USER_B, session.id)).resolves.toBeNull();
  });
});

describe("dashboard", () => {
  it("consolida indicadores reais do acervo", async () => {
    const stats = await dashboardStats(db, USER_A);
    expect(stats.totals.files).toBeGreaterThan(0);
    expect(stats.totals.bytes).toBeGreaterThan(0);
    expect(stats.byType.length).toBeGreaterThan(0);
    expect(
      stats.uploads.active + stats.uploads.completed + stats.uploads.failed,
    ).toBeGreaterThan(0);
  });
});

describe("contexto de usuario (RLS)", () => {
  it("define app.user_id dentro da transacao", async () => {
    const value = await withUser(USER_A, async (tx) => {
      const rows = await tx.query<{ current_setting: string }>(
        "select current_setting('app.user_id', true) as current_setting",
      );
      return rows[0]?.current_setting;
    });
    expect(value).toBe(USER_A);
  });
});

afterAll(async () => {
  await closeDb();
}, 60_000);
