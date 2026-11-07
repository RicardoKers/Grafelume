import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) =>
  page.getByRole("textbox", { name: "Editor de texto", exact: true });

async function write(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.insertText(text);
  // CodeMirror renders each line as a block; textContent omits those breaks.
  await expect(editor(page)).toHaveText(text, { useInnerText: true });
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => dialog.accept());
});

test("keyboard context menu preserves the full selected text", async ({ page }) => {
  await page.goto("./");
  const text = "Este programa escreve com clareza.";
  await write(page, text);
  await editor(page).press("ControlOrMeta+A");
  await editor(page).press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Copiar/ })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(editor(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(text);
  await page.keyboard.insertText("Texto substituído.");
  await expect(editor(page)).toHaveText("Texto substituído.");
});

test("copy and cut from the keyboard menu use the selection and remain undoable", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Playwright clipboard permission grants are Chromium-specific.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  const text = "Este programa escreve com clareza.";
  await write(page, text);
  await editor(page).press("ControlOrMeta+A");
  await editor(page).press("Shift+F10");
  await page.getByRole("menuitem", { name: /^Copiar/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await expect(editor(page)).toHaveText(text);
  await editor(page).press("Shift+F10");
  await page.getByRole("menuitem", { name: /^Recortar/ }).click();
  await expect(editor(page).locator(".cm-placeholder")).toBeVisible();
  await expect(page.locator(".status-left")).toContainText("0 caracteres");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(editor(page)).toHaveText(text);
});

test("empty selection disables copy/cut and Tab leaves the context menu", async ({ page }) => {
  await page.goto("./");
  await editor(page).click();
  await editor(page).press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: /^Recortar/ })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: /^Copiar/ })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: /^Colar/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(editor(page)).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Experimentar um exemplo" })).toBeFocused();
});

test("late spelling suggestions and viewport resize keep the menu fully visible", async ({ page }) => {
  // Hold the real suggestion response, so this exercises the menu before and
  // after growth without depending on dictionary speed or arbitrary sleeps.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const held: (() => void)[] = [];
    const testWindow = window as typeof window & {
      __heldSuggestionCount: () => number;
      __releaseSuggestions: () => void;
    };
    testWindow.__heldSuggestionCount = () => held.length;
    testWindow.__releaseSuggestions = () => {
      for (const deliver of held.splice(0)) deliver();
    };
    window.Worker = class extends NativeWorker {
      private suggestionIds = new Set<number>();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          if (!this.suggestionIds.delete(event.data?.id)) return;
          event.stopImmediatePropagation();
          held.push(() => this.dispatchEvent(new MessageEvent("message", { data: event.data })));
        });
      }
      postMessage(message: { type?: string; id?: number }, options?: StructuredSerializeOptions | Transferable[]) {
        if (message.type === "suggest" && typeof message.id === "number") this.suggestionIds.add(message.id);
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto("./");
  await write(page, `${Array.from({ length: 30 }, () => "Um texto claro.").join("\n")}\nprogrma`);
  await editor(page).press("ControlOrMeta+End");
  const error = page.locator(".issue-spelling").filter({ hasText: "progrma" });
  await expect(error).toBeVisible();
  await error.click({ button: "right" });
  const menu = page.getByRole("menu");
  const ignore = page.getByRole("menuitem", { name: "Ignorar palavra nesta sessão", exact: true });
  await expect(ignore).toBeFocused();
  await page.waitForFunction(() => (window as typeof window & { __heldSuggestionCount: () => number }).__heldSuggestionCount() > 0);
  const initial = await menu.boundingBox();
  await page.evaluate(() => (window as typeof window & { __releaseSuggestions: () => void }).__releaseSuggestions());
  await expect(page.getByRole("menuitem", { name: "programa", exact: true })).toBeVisible();
  await expect.poll(async () => (await menu.boundingBox())!.height).toBeGreaterThan(initial!.height);
  await expect.poll(async () => {
    const box = (await menu.boundingBox())!;
    return box.y >= 8 && box.y + box.height <= 593;
  }).toBe(true);
  await expect(ignore).toBeFocused();
  await page.setViewportSize({ width: 560, height: 480 });
  await expect.poll(async () => {
    const box = (await menu.boundingBox())!;
    return box.x >= 8 && box.y >= 8 && box.x + box.width <= 553 && box.y + box.height <= 473;
  }).toBe(true);
  await expect(ignore).toBeFocused();
});
