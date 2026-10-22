import { expect, test } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

/**
 * Upload real de um arquivo pela interface, com verificacao do progresso e da
 * persistencia na biblioteca.
 */
const ADMIN_EMAIL = "e2e@acervodigital.app";
const ADMIN_PASSWORD = "E2e!Passw0rd#2026";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/dashboard|configuracoes\/seguranca/);
}

test.describe("upload e biblioteca", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Requer Chromium");

  test("envia um arquivo e o encontra na biblioteca", async ({ page }) => {
    await login(page);

    // Se a conta de bootstrap exigir troca de senha, concluimos o fluxo.
    if (page.url().includes("seguranca")) {
      await page.getByLabel("Senha atual").fill(ADMIN_PASSWORD);
      await page.getByLabel("Nova senha").fill("NovaSenha#Forte2026");
      await page.getByLabel("Confirmar nova senha").fill("NovaSenha#Forte2026");
      await page.getByRole("button", { name: "Alterar senha" }).click();
      await page.waitForURL(/\/login/);
      await login(page);
    }

    const fixture = path.join(process.cwd(), "tests", "fixtures", "e2e.txt");
    await page.goto("/biblioteca");
    await page.getByRole("button", { name: "Enviar arquivos" }).click();
    await page.getByRole("button", { name: "Selecionar arquivos" }).click();
    await page.setInputFiles('input[type="file"]', fixture);

    await expect(page.getByText(/na fila de upload/i)).toBeVisible();

    await page.goto("/uploads");
    await expect(page.getByText("e2e.txt")).toBeVisible({ timeout: 30_000 });

    await page.goto("/biblioteca");
    await expect(page.getByText("e2e.txt").first()).toBeVisible({ timeout: 30_000 });
  });
});
