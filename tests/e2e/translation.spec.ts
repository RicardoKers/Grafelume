import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const editor = (page: Page) =>
  page.getByRole("textbox", {
    name: "Editor de texto",
    exact: true,
    includeHidden: true,
  });
const translationDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Tradução local", exact: true });
const translation = (dialog: Locator) =>
  dialog.getByRole("textbox", { name: "Tradução", exact: true });

async function expectText(page: Page, text: string) {
  await expect
    .poll(async () =>
      (await editor(page).locator(".cm-line").allTextContents()).join("\n"),
    )
    .toBe(text);
}

async function write(page: Page, text: string) {
  // Firefox's synthetic replacement of an existing CodeMirror selection can
  // deliver only the deletion. Separate clearing from entering the new fixture.
  await editor(page).fill("");
  await expect(
    page.locator(".document-heading").getByRole("button", { name: "Traduzir", exact: true }),
  ).toBeDisabled();
  await editor(page).fill(text);
  await expectText(page, text);
}

async function openTranslation(page: Page, language: "en-US" | "pt-BR") {
  await page
    .locator(".document-heading")
    .getByRole("button", { name: "Traduzir", exact: true })
    .click();
  const dialog = translationDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Idioma do original", exact: true }).selectOption(language);
  return dialog;
}

async function translate(dialog: Locator, expected: RegExp[]) {
  await dialog
    .getByRole("button", {
      name: /^(Baixar modelo e traduzir|Traduzir|Tentar novamente)$/,
    })
    .click();
  for (const fragment of expected)
    await expect(translation(dialog)).toHaveValue(fragment, { timeout: 60_000 });
  await expect(
    dialog.getByRole("button", { name: "Usar tradução no editor", exact: true }),
  ).toBeEnabled();
  return translation(dialog).inputValue();
}

async function applyAndUndo(page: Page, original: string, translated: string) {
  await expectText(page, original);
  await translationDialog(page)
    .getByRole("button", { name: "Usar tradução no editor", exact: true })
    .click();
  await expect(translationDialog(page)).toHaveCount(0);
  await expectText(page, translated);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expectText(page, original);
}

test("real translation preserves sentences, selection and undo, then survives a fully offline reload", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") await dialog.accept();
  });
  page.on("pageerror", (error) => console.error(`Translation page error: ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`Translation browser error: ${message.text()}`);
  });
  const requests: { url: string; method: string; body: string | null }[] = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  );

  await page.goto("./");
  await page.getByLabel("Idioma do texto").selectOption("en-US");
  const english = "The house is blue. The sky is clear.\nThe editor works without a connection.";
  const portuguese = "A casa é azul. O céu está claro.\nO editor funciona sem conexão.";
  await write(page, english);
  let dialog = await openTranslation(page, "en-US");
  await expect(dialog.getByRole("textbox", { name: "Original", exact: true })).toHaveValue(english);
  await expect(translation(dialog)).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Usar tradução no editor", exact: true })).toBeDisabled();

  // Hold the first static engine request so cancellation cannot race a fast
  // localhost download. Retry below still loads the real unmodified assets.
  const firstAsset = "**/translation/engine/transformers.min.js";
  let release!: () => void;
  let downloadRequested = false;
  let finished!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const completed = new Promise<void>((resolve) => { finished = resolve; });
  const holdDownload = async (route: Route) => {
    downloadRequested = true;
    await held;
    await route.abort("aborted").catch(() => undefined);
    finished();
  };
  await context.route(firstAsset, holdDownload);
  try {
    await dialog.getByRole("button", { name: "Baixar modelo e traduzir", exact: true }).click();
    await expect.poll(() => downloadRequested).toBe(true);
    await expect(dialog.getByRole("progressbar", { name: "Download do modelo de tradução" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar tradução", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Baixar modelo e traduzir", exact: true })).toBeVisible();
    await expect(translation(dialog)).toHaveValue("");
    await expectText(page, english);
  } finally {
    await context.unroute(firstAsset, holdDownload);
    release();
  }
  await completed;

  const unavailable = (route: Route) => route.fulfill({ status: 503, body: "Unavailable" });
  await context.route(firstAsset, unavailable);
  await dialog.getByRole("button", { name: "Baixar modelo e traduzir", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível baixar o modelo");
  await expect(dialog.getByRole("button", { name: "Tentar novamente", exact: true })).toBeVisible();
  await expectText(page, english);
  await context.unroute(firstAsset, unavailable);

  const translatedPortuguese = await translate(dialog, [/A casa é azul\./i, /céu/i, /editor.*sem conexão\./i]);
  expect(translatedPortuguese).toContain("\n");
  await applyAndUndo(page, english, translatedPortuguese);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expectText(page, translatedPortuguese);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expectText(page, english);

  // Translating a selection must replace only the captured range.
  await page.getByLabel("Idioma do texto").selectOption("en-US");
  await editor(page).click();
  await editor(page).press("ControlOrMeta+Home");
  for (const _ of "The house is blue.") await editor(page).press("Shift+ArrowRight");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("The house is blue.");
  dialog = await openTranslation(page, "en-US");
  await expect(dialog.getByRole("textbox", { name: "Original", exact: true })).toHaveValue("The house is blue.");
  await expect(dialog.locator(".eyebrow")).toHaveText("Trecho selecionado");
  await expect(dialog.getByRole("button", { name: "Traduzir", exact: true })).toBeVisible();
  const selectionResult = await translate(dialog, [/A casa é azul\./i]);
  await applyAndUndo(page, english, `${selectionResult} The sky is clear.\nThe editor works without a connection.`);

  await page.getByLabel("Idioma do texto").selectOption("pt-BR");
  await write(page, portuguese);
  dialog = await openTranslation(page, "pt-BR");
  const translatedEnglish = await translate(dialog, [/The house is blue\./i, /sky/i, /editor works without a connection\./i]);
  expect(translatedEnglish).toContain("\n");
  await applyAndUndo(page, portuguese, translatedEnglish);

  // The shell and both dictionaries also need to be available after navigation.
  await page.getByRole("button", { name: "Preparar offline", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Português e inglês prontos para usar sem conexão.",
    { timeout: 30_000 },
  );
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(editor(page)).toBeVisible();
    for (const sample of [
      { language: "pt-BR" as const, original: portuguese, expected: [/The house is blue\./i, /sky/i, /editor works without a connection\./i] },
      { language: "en-US" as const, original: english, expected: [/A casa é azul\./i, /céu/i, /editor.*sem conexão\./i] },
    ]) {
      await page.getByLabel("Idioma do texto").selectOption(sample.language);
      await write(page, sample.original);
      dialog = await openTranslation(page, sample.language);
      await expect(dialog.getByText("Modelo disponível para uso offline.", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Traduzir", exact: true })).toBeVisible();
      const result = await translate(dialog, sample.expected);
      expect(result).toContain("\n");
      await expectText(page, sample.original);
      await dialog.getByRole("button", { name: "Fechar tradução", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
  } finally {
    await context.setOffline(false);
  }

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(new URL(request.url).origin).toBe("http://127.0.0.1:4173");
    expect(["GET", "HEAD"]).toContain(request.method);
    expect(request.body).toBeNull();
    const decoded = decodeURIComponent(request.url);
    for (const fragment of ["The house is blue", "A casa é azul", "The editor works", "O editor funciona"])
      expect(decoded).not.toContain(fragment);
  }
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith("grafelume-translation-"));
    const entries: string[] = [];
    for (const name of names)
      entries.push(...(await (await caches.open(name)).keys()).map((key) => key.url));
    return entries;
  });
  expect(cached.length).toBeGreaterThan(0);
  for (const url of cached)
    expect(new URL(url).pathname).toMatch(/^\/Grafelume\/translation\/(engine|models)\//);
});
