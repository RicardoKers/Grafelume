import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("disabling a failed spellchecker clears its error and keeps basic review", async ({ page }) => {
  await page.route("**/dictionaries/pt-BR.dic", route =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("./");
  const editor = page.getByRole("textbox", { name: "Editor de texto", exact: true });
  await editor.click();
  await page.keyboard.insertText("Um  progrma.");
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar o dicionário");
  await page.getByRole("button", { name: "Correção ortográfica", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".checker-state.disabled")).toBeVisible();
  await expect(page.locator(".issue-review")).toBeVisible();
  await expect(editor).toHaveText("Um  progrma.");
  await page.unroute("**/dictionaries/pt-BR.dic");
  await page.getByRole("button", { name: "Correção ortográfica", exact: true }).click();
  await expect(page.locator(".issue-spelling").filter({ hasText: "progrma" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("retry recreates a worker that failed to load without losing the document", async ({ page }) => {
  const workerRoute = "**/assets/SpellWorker-*.js";
  await page.route(workerRoute, route => route.abort());
  await page.goto("./");
  const editor = page.getByRole("textbox", { name: "Editor de texto", exact: true });
  await editor.click();
  await page.keyboard.insertText("Este progrma é privado.");
  await expect(page.getByRole("alert")).toContainText("Não foi possível iniciar o corretor local");
  await page.unroute(workerRoute);
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.locator(".issue-spelling").filter({ hasText: "progrma" })).toBeVisible();
  await expect(page.locator(".checker-state.ready")).toBeVisible();
  await expect(editor).toHaveText("Este progrma é privado.");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
