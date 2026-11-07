import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) =>
  page.getByRole("textbox", { name: "Editor de texto", exact: true });
const misspelling = (page: Page, word: string) =>
  page.locator(".issue-spelling").filter({ hasText: word });

async function write(page: Page, text: string) {
  await editor(page).click();
  await editor(page).press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
  await expect(editor(page)).toHaveText(text);
}

async function openSettings(page: Page, tab?: string) {
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  if (tab)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: tab, exact: true })
      .click();
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") await dialog.accept();
  });
});

test("loads the GitHub Pages base and keeps document content out of requests and storage", async ({
  page,
  context,
}) => {
  const requests: { url: string; method: string; body: string | null }[] = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  );
  await page.goto("./");
  await expect(editor(page)).toBeVisible();
  const secret = "Documento privado xptovertência com ação e clareza.";
  await write(page, secret);
  await expect(misspelling(page, "xptovertência")).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(new URL(request.url).origin).toBe("http://127.0.0.1:4173");
    expect(["GET", "HEAD"]).toContain(request.method);
    expect(request.body).toBeNull();
    expect(decodeURIComponent(request.url)).not.toContain(secret);
  }
  const stored = await page.evaluate(() =>
    Object.values(localStorage).join(" "),
  );
  expect(stored).not.toContain(secret);
  await page.reload();
  await expect(editor(page)).not.toContainText(secret);
});

test("underlines errors, replaces only the chosen occurrence and supports undo/redo", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "Este progrma e outro progrma.");
  await expect(misspelling(page, "progrma")).toHaveCount(2);
  await misspelling(page, "progrma").last().click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "programa", exact: true }).click();
  await expect(editor(page)).toHaveText("Este progrma e outro programa.");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(editor(page)).toHaveText("Este progrma e outro progrma.");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(editor(page)).toHaveText("Este progrma e outro programa.");
  await expect(misspelling(page, "progrma")).toHaveCount(1);
});

test("switches dictionaries and offers American English suggestions", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Idioma do texto").selectOption("en-US");
  await write(page, "The world is beautiful. wrld");
  await expect(misspelling(page, "wrld")).toBeVisible();
  await expect(page.locator(".issue-spelling")).toHaveCount(1);
  await misspelling(page, "wrld").click({ button: "right" });
  await page.getByRole("menuitem", { name: "world", exact: true }).click();
  await expect(editor(page)).toHaveText("The world is beautiful. world");
  await page.getByLabel("Idioma do texto").selectOption("pt-BR");
  await expect(misspelling(page, "world")).toHaveCount(2);
});

test("personal words persist by language and can be removed", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "Grafelumexpto");
  await expect(misspelling(page, "Grafelumexpto")).toBeVisible();
  await misspelling(page, "Grafelumexpto").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Adicionar ao dicionário", exact: true })
    .click();
  await expect(page.locator(".issue-spelling")).toHaveCount(0);
  await page.reload();
  await write(page, "Grafelumexpto");
  await openSettings(page, "Dicionário");
  await expect(
    page.getByRole("dialog").getByText("Grafelumexpto", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remover Grafelumexpto", exact: true })
    .click();
  await page.getByRole("button", { name: "Fechar configurações" }).click();
  await expect(misspelling(page, "Grafelumexpto")).toBeVisible();
  await openSettings(page, "Dicionário");
  await page.getByLabel("Nova palavra").fill("Grafelumexpto");
  await page
    .getByRole("button", { name: "Adicionar palavra", exact: true })
    .click();
  await page.getByRole("button", { name: "Fechar configurações" }).click();
  await expect(page.locator(".issue-spelling")).toHaveCount(0);
  await page.getByLabel("Idioma do texto").selectOption("en-US");
  await expect(misspelling(page, "Grafelumexpto")).toBeVisible();
});

test("ignore applies to the session and does not persist after reload", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "xptodesconhecida");
  await expect(misspelling(page, "xptodesconhecida")).toBeVisible();
  await misspelling(page, "xptodesconhecida").click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: "Ignorar palavra nesta sessão",
      exact: true,
    })
    .click();
  await expect(page.locator(".issue-spelling")).toHaveCount(0);
  await page.reload();
  await write(page, "xptodesconhecida");
  await expect(misspelling(page, "xptodesconhecida")).toBeVisible();
});

test("theme and reading preferences persist", async ({ page }) => {
  await page.goto("./");
  await openSettings(page);
  await page.getByRole("dialog").getByLabel(/^Tema/).selectOption("dark");
  await page
    .getByRole("dialog")
    .getByLabel(/^Fonte/)
    .selectOption("serif");
  await page.getByRole("button", { name: "Fechar configurações" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await openSettings(page);
  await expect(page.getByRole("dialog").getByLabel(/^Fonte/)).toHaveValue(
    "serif",
  );
  await page.getByRole("button", { name: "Fechar configurações" }).click();
  await page
    .getByRole("button", { name: "Alternar tema", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("decoration updates preserve the cursor and text selection", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "Este progrma está aqui.");
  await editor(page).press("ControlOrMeta+Home");
  for (let i = 0; i < 5; i++) await editor(page).press("Shift+ArrowRight");
  await expect(misspelling(page, "progrma")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Este ");
  await editor(page).press("ArrowRight");
  await page.keyboard.insertText("X");
  await expect(editor(page)).toHaveText("Este Xprogrma está aqui.");
});

test("the context menu supports keyboard navigation and dismissal", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "progrma");
  await expect(misspelling(page, "progrma")).toBeVisible();
  await editor(page).press("ControlOrMeta+Home");
  await editor(page).press("ArrowRight");
  await editor(page).press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Selecionar tudo", exact: false }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await write(page, "programa");
  await expect(page.locator(".checker-state.ready")).toBeVisible();
  await editor(page).press("ControlOrMeta+Home");
  await editor(page).press("Shift+F10");
  await expect(page.getByRole("menuitem")).toHaveCount(4);
  await expect(
    page.getByRole("menuitem", {
      name: "Adicionar ao dicionário",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("copy and paste use plain text after an explicit toolbar action", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Firefox does not offer Playwright clipboard permission grants.",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  await page.evaluate(() => navigator.clipboard.writeText("Ação e clareza."));
  await editor(page).click();
  await page.getByRole("button", { name: "Colar texto", exact: true }).click();
  await expect(editor(page)).toHaveText("Ação e clareza.");
  await page.getByRole("button", { name: "Copiar texto", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Ação e clareza.");
  await page.evaluate(async () => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(["<b>Texto simples</b>"], { type: "text/html" }),
        "text/plain": new Blob(["Texto simples"], { type: "text/plain" }),
      }),
    ]);
  });
  await editor(page).click();
  await editor(page).press("ControlOrMeta+A");
  await editor(page).press("ControlOrMeta+V");
  await expect(editor(page)).toHaveText("Texto simples");
  await expect(editor(page).locator("b")).toHaveCount(0);
});

test("imports UTF-8 TXT and exports exactly the edited content", async ({
  page,
}) => {
  await page.goto("./");
  const content = "Ação e café. 😀";
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "entrada.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(`\uFEFF${content}`, "utf8"),
    });
  await expect(editor(page)).toHaveText(content);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar TXT", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
  expect(await readFile((await download.path())!, "utf8")).toBe(content);
});

test("review suggestions are explicit and undoable", async ({ page }) => {
  await page.goto("./");
  await write(page, "Um  texto.");
  await expect(page.locator(".issue-review")).toBeVisible();
  await page.locator(".issue-heading").first().click();
  await page
    .getByRole("button", { name: /^Substituir por/ })
    .first()
    .click();
  await expect(editor(page)).toHaveText("Um texto.");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(editor(page)).toHaveText("Um  texto.");
});

test("clear asks before discarding and spelling can be disabled independently", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "progrma  texto");
  await expect(misspelling(page, "progrma")).toBeVisible();
  await page
    .getByRole("button", { name: "Correção ortográfica", exact: true })
    .click();
  await expect(page.locator(".issue-spelling")).toHaveCount(0);
  await expect(page.locator(".issue-review")).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Novo texto", exact: true }).click();
  await expect(editor(page)).toHaveText("progrma  texto");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Novo texto", exact: true }).click();
  await expect(editor(page)).not.toContainText("progrma");
});

test("a real Chromium composition commits accented Unicode text without duplication", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "The CDP IME composition API is Chromium-specific.",
  );
  await page.goto("./");
  await editor(page).click();
  const session = await context.newCDPSession(page);
  await session.send("Input.imeSetComposition", {
    text: "ação",
    selectionStart: 4,
    selectionEnd: 4,
  });
  await session.send("Input.insertText", { text: "ação" });
  await expect(editor(page)).toHaveText("ação");
  await expect(page.locator(".issue-spelling")).toHaveCount(0);
  await session.detach();
});

test("prepares both dictionaries and corrects text after a fully offline reload", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Preparar offline", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const cache = await caches.open("grafelume-dictionaries-v1");
          const keys = await cache.keys();
          return keys.filter((key) =>
            /\/(pt-BR|en-US)\.(aff|dic)$/.test(key.url),
          ).length;
        }),
      { timeout: 30_000 },
    )
    .toBe(4);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The initial shell may not yet be controlled when installation finishes.
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(editor(page)).toBeVisible();
  await write(page, "Este progrma.");
  await expect(misspelling(page, "progrma")).toBeVisible();
  await page.getByLabel("Idioma do texto").selectOption("en-US");
  await write(page, "hello wrld");
  await expect(misspelling(page, "wrld")).toBeVisible();
  await misspelling(page, "wrld").click({ button: "right" });
  await page.getByRole("menuitem", { name: "world", exact: true }).click();
  await expect(editor(page)).toHaveText("hello world");
});

test("dictionary load failures are visible and retry recovers", async ({
  browser,
}) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    await context.route("**/dictionaries/pt-BR.dic", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4173/Grafelume/");
    await write(page, "Este progrma.");
    await expect(
      page.getByText(/Não foi possível carregar o dicionário/),
    ).toBeVisible();
    await context.unroute("**/dictionaries/pt-BR.dic");
    await page
      .getByRole("button", { name: "Tentar novamente", exact: true })
      .click();
    await expect(misspelling(page, "progrma")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("keeps the mobile editor usable without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(editor(page)).toBeVisible();
  await write(page, "Um texto no celular.");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
