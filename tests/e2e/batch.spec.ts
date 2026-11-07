import { expect, test, type Locator, type Page } from "@playwright/test";

const editor = (page: Page) =>
  page.getByRole("textbox", {
    name: "Editor de texto",
    exact: true,
    includeHidden: true,
  });

async function expectText(page: Page, text: string) {
  // Hard line breaks are rendered as separate blocks by CodeMirror.
  await expect
    .poll(async () =>
      (await editor(page).locator(".cm-line").allTextContents()).join("\n"),
    )
    .toBe(text);
}

async function write(page: Page, text: string) {
  await editor(page).click();
  await editor(page).press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
  await expectText(page, text);
  await expect(page.locator(".checker-state.ready")).toBeVisible();
}

function spellingCards(page: Page, word: string): Locator {
  return page
    .locator(".issue-card")
    .filter({
      has: page.locator(".issue-category.spelling"),
    })
    .filter({
      has: page.locator(".issue-heading strong").filter({ hasText: word }),
    });
}

const preview = (page: Page, count: number) =>
  page.getByRole("button", { name: `Ver prévia (${count})`, exact: true });

async function enterBatch(page: Page) {
  const start = page.getByRole("button", {
    name: "Correções em lote",
    exact: true,
  });
  await expect(start).toHaveAttribute("aria-pressed", "false");
  await start.click();
  await expect(preview(page, 0)).toBeDisabled();
}

async function queueSpelling(
  page: Page,
  word: string,
  replacement: string,
  occurrence = 0,
) {
  const card = spellingCards(page, word).nth(occurrence);
  await card.locator(".issue-heading").click();
  const choice = card.getByRole("button", {
    name: `Selecionar para o lote: Substituir por ${replacement}`,
    exact: true,
  });
  await expect(choice).toBeEnabled();
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  return card;
}

async function openPreview(page: Page, count: number) {
  await preview(page, count).click();
  const dialog = page.getByRole("dialog", {
    name: "Prévia das correções",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".batch-preview-item")).toHaveCount(count);
  return dialog;
}

async function applyPreview(page: Page, count: number) {
  const dialog = page.getByRole("dialog", {
    name: "Prévia das correções",
    exact: true,
  });
  await dialog
    .getByRole("button", {
      name: `Aplicar ${count} ${count === 1 ? "correção" : "correções"}`,
      exact: true,
    })
    .click();
  await expect(dialog).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") await dialog.accept();
  });
});

test("only explicitly chosen spelling and review fixes enter a preview and one undoable transaction", async ({
  page,
}) => {
  await page.goto("./");
  const original =
    "Este progrma  verifica outro progrma e um terceiro progrma. Código AB12 e snake_case.";
  const corrected =
    "Este programa verifica outro programa e um terceiro progrma. Código AB12 e snake_case.";
  await write(page, original);
  await expect(spellingCards(page, "progrma")).toHaveCount(3);
  await enterBatch(page);
  await expect(
    page.locator('.suggestion-chip[aria-pressed="true"]'),
  ).toHaveCount(0);

  await queueSpelling(page, "progrma", "programa", 0);
  await queueSpelling(page, "progrma", "programa", 1);
  const spaces = page
    .locator(".issue-card")
    .filter({ has: page.locator(".issue-category.review") });
  await expect(spaces).toHaveCount(1);
  await spaces.locator(".issue-heading").click();
  await spaces
    .getByRole("button", {
      name: "Selecionar para o lote: Substituir por um espaço",
      exact: true,
    })
    .click();
  await expectText(page, original);

  const dialog = await openPreview(page, 3);
  await expect(dialog).toContainText("Linha 1");
  await expect(dialog.locator(".batch-preview-before")).toHaveCount(3);
  await expect(dialog.locator(".batch-preview-after")).toHaveCount(3);
  await expect(dialog).toContainText("programa");
  await expectText(page, original);
  await applyPreview(page, 3);
  await expectText(page, corrected);
  await expect(editor(page)).toBeFocused();
  await expect(spellingCards(page, "progrma")).toHaveCount(1);

  await editor(page).press("ControlOrMeta+Z");
  await expectText(page, original);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expectText(page, corrected);
});

test("a repeated word is corrected only at the selected occurrence", async ({
  page,
}) => {
  await page.goto("./");
  const original = "Um progrma, outro progrma.";
  await write(page, original);
  await expect(spellingCards(page, "progrma")).toHaveCount(2);
  await enterBatch(page);
  await queueSpelling(page, "progrma", "programa", 1);
  const dialog = await openPreview(page, 1);
  await expect(dialog).toContainText("Linha 1 · coluna 19");
  await applyPreview(page, 1);
  await expectText(page, "Um progrma, outro programa.");
});

test("cancel preserves choices, choosing another suggestion replaces the choice, and clearing never edits text", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "progrma");
  await enterBatch(page);
  const card = await queueSpelling(page, "progrma", "programa");
  let dialog = await openPreview(page, 1);
  await dialog
    .getByRole("button", { name: "Voltar à seleção", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(preview(page, 1)).toBeEnabled();
  await expectText(page, "progrma");
  dialog = await openPreview(page, 1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(preview(page, 1)).toBeEnabled();

  const options = card.getByRole("button", {
    name: /^Selecionar para o lote:/,
  });
  await expect.poll(() => options.count()).toBeGreaterThan(1);
  const first = card.getByRole("button", {
    name: "Selecionar para o lote: Substituir por programa",
    exact: true,
  });
  const names = await options.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  );
  const otherIndex = names.findIndex(
    (name) => name !== "Selecionar para o lote: Substituir por programa",
  );
  expect(otherIndex).toBeGreaterThanOrEqual(0);
  const other = options.nth(otherIndex);
  await other.click();
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(preview(page, 1)).toBeEnabled();
  await other.click();
  await expect(preview(page, 0)).toBeDisabled();
  await first.click();
  await page
    .getByRole("button", { name: "Limpar seleção", exact: true })
    .click();
  await expect(preview(page, 0)).toBeDisabled();
  await first.click();
  await page.getByRole("button", { name: "Sair do lote", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Ver prévia/ })).toHaveCount(
    0,
  );
  await expectText(page, "progrma");
});

test("editing the document, changing language or ignoring a review invalidates selected fixes", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "Este progrma.");
  await enterBatch(page);
  await queueSpelling(page, "progrma", "programa");
  await editor(page).press("ControlOrMeta+End");
  await page.keyboard.insertText(" Agora.");
  await expectText(page, "Este progrma. Agora.");
  await expect(preview(page, 0)).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".checker-state.ready")).toBeVisible();
  await queueSpelling(page, "progrma", "programa");
  await page.getByLabel("Idioma do texto").selectOption("en-US");
  await expect(preview(page, 0)).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expectText(page, "Este progrma. Agora.");
  await page.getByLabel("Idioma do texto").selectOption("pt-BR");
  await write(page, "Este Este texto.");
  const repeated = page.locator(".issue-card").filter({
    has: page.locator(".issue-category.review"),
  });
  await repeated.locator(".issue-heading").click();
  await repeated
    .getByRole("button", {
      name: "Selecionar para o lote: Substituir por Este",
      exact: true,
    })
    .click();
  await expect(preview(page, 1)).toBeEnabled();
  await page.locator(".issue-review").click({ button: "right" });
  await page
    .getByRole("menuitem", {
      name: "Ignorar palavra nesta sessão",
      exact: true,
    })
    .click();
  await expect(preview(page, 0)).toBeDisabled();
  await expect(page.locator(".issue-category.review")).toHaveCount(0);
  await expectText(page, "Este Este texto.");
});

test("overlapping spelling and repeated-word fixes are rejected without replacing prior choices", async ({
  page,
}) => {
  await page.goto("./");
  await write(page, "progrma progrma");
  await expect(spellingCards(page, "progrma")).toHaveCount(2);
  await enterBatch(page);
  await queueSpelling(page, "progrma", "programa", 0);
  const repeated = page
    .locator(".issue-card")
    .filter({ has: page.locator(".issue-category.review") });
  await repeated.locator(".issue-heading").click();
  await repeated
    .getByRole("button", {
      name: "Selecionar para o lote: Substituir por progrma",
      exact: true,
    })
    .click();
  await expect(page.locator(".toast")).toContainText(/sobrep|conflito/i);
  await expect(preview(page, 1)).toBeEnabled();
  await expectText(page, "progrma progrma");
  await openPreview(page, 1);
  await applyPreview(page, 1);
  await expectText(page, "programa progrma");
});

test("technical identifiers cannot enter a batch even with technical filtering disabled", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  const settings = page.getByRole("dialog");
  await settings.getByRole("button", { name: "Correção", exact: true }).click();
  await settings
    .getByLabel("Reconhecer URLs, códigos e termos técnicos", { exact: true })
    .uncheck();
  await settings
    .getByRole("button", { name: "Fechar configurações", exact: true })
    .click();
  const original = "O identificador progrma_nome fica aqui.";
  await write(page, original);
  await enterBatch(page);
  const card = spellingCards(page, "progrma").first();
  await card.locator(".issue-heading").click();
  await expect(
    card.getByRole("button", {
      name: "Selecionar para o lote: Substituir por programa",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(card).toContainText(/técnico/i);
  await expect(preview(page, 0)).toBeDisabled();
  await expectText(page, original);
});

test("the preview keeps keyboard focus and stays usable at 320 pixels in both themes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("./");
  const original = "progrma, progrma, progrma";
  await write(page, original);
  await enterBatch(page);
  await queueSpelling(page, "progrma", "programa", 0);
  await queueSpelling(page, "progrma", "programa", 1);
  await queueSpelling(page, "progrma", "programa", 2);
  for (const dark of [false, true]) {
    if (dark)
      await page
        .getByRole("button", { name: "Alternar tema", exact: true })
        .click();
    const dialog = await openPreview(page, 3);
    const cancel = dialog.getByRole("button", {
      name: "Voltar à seleção",
      exact: true,
    });
    const apply = dialog.getByRole("button", {
      name: "Aplicar 3 correções",
      exact: true,
    });
    const title = dialog.getByRole("heading", {
      name: "Prévia das correções",
      exact: true,
    });
    await expect(cancel).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeLessThanOrEqual(844);
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(apply).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Tab");
    await expect(apply).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancel).toBeFocused();
    // Native showModal makes controls in the underlying page inert.
    await page
      .getByRole("button", {
        name: "Configurações",
        exact: true,
        includeHidden: true,
      })
      .evaluate((button) => (button as HTMLButtonElement).focus());
    await expect(cancel).toBeFocused();
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) => {
          // Native dialogs may yield focus to browser chrome between Tab cycles;
          // no control in the underlying application may become focused.
          return (
            element.matches(":modal") &&
            (element.contains(document.activeElement) ||
              document.activeElement === document.body)
          );
        }),
      ).toBe(true);
    }
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(apply).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(preview(page, 3)).toBeEnabled();
    await expectText(page, original);
  }
});

test("an English batch works after a fully offline reload and preserves Unicode offsets", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Preparar offline", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Português e inglês prontos para usar sem conexão.",
    { timeout: 30_000 },
  );
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await page.getByLabel("Idioma do texto").selectOption("en-US");
    const original = "😀 hello wrld. We are writting.";
    await write(page, original);
    await enterBatch(page);
    await queueSpelling(page, "wrld", "world");
    await queueSpelling(page, "writting", "writing");
    await expectText(page, original);
    await openPreview(page, 2);
    await applyPreview(page, 2);
    await expectText(page, "😀 hello world. We are writing.");
    await editor(page).press("ControlOrMeta+Z");
    await expectText(page, original);
  } finally {
    await context.setOffline(false);
  }
});
