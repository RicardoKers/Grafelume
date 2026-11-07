import { expect, test, type Locator, type Page } from "@playwright/test";

const editor = (page: Page) =>
  page.getByRole("textbox", { name: "Editor de texto", exact: true });

async function write(page: Page, value: string) {
  await editor(page).click();
  await editor(page).press("ControlOrMeta+A");
  await page.keyboard.insertText(value);
  await expectEditorText(page, value);
}

async function expectEditorText(page: Page, value: string) {
  // CodeMirror renders hard line breaks as adjacent block nodes, not text nodes.
  await expect.poll(async () => (await editor(page).locator(".cm-line").allTextContents()).join("\n")).toBe(value);
}

async function expectReadable(locator: Locator, minimumFontSize = 10) {
  const actual = await locator.evaluate((element) => {
    function rgba(value: string): number[] {
      return value.match(/[\d.]+/g)!.map(Number);
    }
    function luminance(color: number[]): number {
      return color.slice(0, 3).reduce((sum, component, index) => {
        const value = component / 255;
        const linear = value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
      }, 0);
    }
    const style = getComputedStyle(element);
    let ancestor: Element | null = element;
    let background = [255, 255, 255];
    while (ancestor) {
      const color = rgba(getComputedStyle(ancestor).backgroundColor);
      if (color.length === 3 || color[3] === 1) {
        background = color;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    const foregroundLuminance = luminance(rgba(style.color));
    const backgroundLuminance = luminance(background);
    return {
      contrast: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
      fontSize: parseFloat(style.fontSize),
    };
  });
  expect(actual.contrast, `Rendered text contrast for ${await locator.innerText()}`).toBeGreaterThanOrEqual(4.5);
  expect(actual.fontSize).toBeGreaterThanOrEqual(minimumFontSize);
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") await dialog.accept();
  });
});

test("space corrections describe the replacement to visual and screen reader users", async ({ page }) => {
  await page.goto("./");
  await write(page, "Um  texto.");
  await expect(page.locator(".issue-review")).toBeVisible();
  await page.locator(".issue-heading").first().click();
  const replaceSpace = page.getByRole("button", {
    name: "Substituir por um espaço", exact: true,
  });
  await expect(replaceSpace).toHaveText("Substituir por um espaço");
  await replaceSpace.click();
  await expect(editor(page)).toHaveText("Um texto.");

  await write(page, "Um texto .");
  await expect(page.locator(".issue-review")).toBeVisible();
  await page.locator(".issue-heading").first().click();
  const removeSpace = page.getByRole("button", { name: "Remover espaço", exact: true });
  await expect(removeSpace).toHaveText("Remover espaço");
  await removeSpace.click();
  await expect(editor(page)).toHaveText("Um texto.");

  await write(page, "Um texto.\n\n\n\nOutro texto.");
  // Empty lines have no visible glyph to underline; review still lists them.
  await expect(page.locator(".issue-heading")).toHaveCount(1);
  await expect(page.locator(".issue-category.review")).toBeVisible();
  await page.locator(".issue-heading").first().click();
  const replaceLines = page.getByRole("button", {
    name: "Substituir por 2 quebras de linha", exact: true,
  });
  await expect(replaceLines).toHaveText("Substituir por 2 quebras de linha");
  await replaceLines.click();
  await expectEditorText(page, "Um texto.\n\nOutro texto.");
});

test("review actions and document information stay readable in both themes and on narrow screens", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  for (const dark of [false, true]) {
    if (dark) await page.getByRole("button", { name: "Alternar tema", exact: true }).click();
    await write(page, "progrma");
    await expect(page.locator(".issue-spelling")).toBeVisible();
    await page.locator(".issue-heading").first().click();
    const ignore = page.getByRole("button", { name: "Ignorar", exact: true });
    await expect(ignore).toBeVisible();
    await expectReadable(ignore, 11);
    await expectReadable(page.locator(".issue-category.spelling"));
    await expectReadable(page.locator(".document-bottom span"));
    await expectReadable(page.locator(".workspace-footer > span"));
    await expectReadable(page.locator(".status-left > span").first(), 11);
    await expectReadable(page.locator(".checker-state"), 11);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expectReadable(ignore, 11);
      await expectReadable(page.locator(".document-bottom span"));
      await expectReadable(page.locator(".status-left > span").first(), 11);
      await expect(page.getByRole("button", { name: "Painel de revisão", exact: true })).toBeInViewport({ ratio: 1 });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
  }
});
