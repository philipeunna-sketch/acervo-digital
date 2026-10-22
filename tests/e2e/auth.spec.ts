import { expect, test } from "@playwright/test";

/**
 * Fluxo de autenticacao: protecao de rotas privadas, login, sessao e logout.
 * O servidor de testes sobe com o driver local (PGlite + storage em disco).
 */
const ADMIN_EMAIL = "e2e@acervodigital.app";
const ADMIN_PASSWORD = "E2e!Passw0rd#2026";

test.describe("autenticacao", () => {
  test("rota privada redireciona para o login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Acervo Digital" })).toBeVisible();
  });

  test("login invalido mostra mensagem de erro", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert")).toContainText(/invalidos/i);
  });

  test("login valido acessa o dashboard e permite sair", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Senha").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    // A conta de bootstrap exige troca de senha no primeiro acesso.
    await expect(page).toHaveURL(/\/configuracoes\/seguranca/);

    await page.getByLabel("Senha atual").fill(ADMIN_PASSWORD);
    await page.getByLabel("Nova senha").fill("NovaSenha#Forte2026");
    await page.getByLabel("Confirmar nova senha").fill("NovaSenha#Forte2026");
    await page.getByRole("button", { name: "Alterar senha" }).click();

    await expect(page).toHaveURL(/\/login/);

    // Reentrega com a nova senha
    await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
    await page.getByLabel("Senha").fill("NovaSenha#Forte2026");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole("button", { name: "Menu do usuario" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
