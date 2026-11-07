import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const url =
  process.argv[2] ||
  process.env.BENCHMARK_URL ||
  "http://127.0.0.1:4173/Grafelume/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  serviceWorkers: "allow",
});
const page = await context.newPage();
page.on("dialog", (dialog) => dialog.accept());
const result = {
  measuredAt: new Date().toISOString(),
  browser: `Chromium ${browser.version()}`,
  environment: {
    platform: process.platform,
    node: process.version,
    viewport: "1440x960",
    headless: true,
  },
  document: {
    words: 10_000,
    unknownOccurrences: 2_000,
    distinctUnknownWords: 1_001,
    paragraphs: 1_000,
  },
  timingsMs: {},
  limits: [
    "Uma execução em Chromium headless neste computador; não é garantia de latência em outros dispositivos.",
    "Tempos de interface incluem debounce de 260 ms, contagem, revisão básica, transporte ao Worker, renderização e chamadas de automação.",
    "A carga inicial usa contexto novo, mas o servidor e o cache de disco do sistema operacional podem estar aquecidos.",
    "Digitação usa eventos reais de teclado via Playwright e mede evento até o próximo frame; long tasks abrangem somente a thread principal.",
    "Carga usa o controle real Importar TXT; colagem dispara ClipboardEvent de texto simples no editor, sem tocar a área de transferência do sistema.",
    "Nenhum texto de teste é persistido neste resultado.",
  ],
};
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(
    (
      sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
      ] ?? 0
    ).toFixed(2),
  );
}
async function now() {
  return page.evaluate(() => performance.now());
}
async function settled() {
  await page.waitForFunction(
    () => {
      const ready = document
        .querySelector(".checker-state")
        ?.classList.contains("ready");
      const count = Number(
        document
          .querySelector(".issue-status")
          ?.textContent?.replace(/\D/g, ""),
      );
      return ready && count === 2_000;
    },
    null,
    { timeout: 60_000 },
  );
}
try {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".checker-state.ready").waitFor({ timeout: 60_000 });
  result.timingsMs.navigationToCheckerReady = Number((await now()).toFixed(2));
  await page.evaluate(() => {
    window.__grafelumeBenchmark = { frames: [], longTasks: [] };
    const data = window.__grafelumeBenchmark;
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key.length !== 1) return;
        const start = performance.now();
        requestAnimationFrame(() =>
          data.frames.push(performance.now() - start),
        );
      },
      true,
    );
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          data.longTasks.push(entry.duration);
      }).observe({ type: "longtask", buffered: false });
    } catch {
      /* Optional browser metric. */
    }
  });
  const text = Array.from({ length: 1_000 }, (_, i) => {
    const suffix = [Math.floor(i / 676), Math.floor(i / 26) % 26, i % 26]
      .map((part) => String.fromCharCode(97 + part))
      .join("");
    return `Este programa permite verificar a ortografia dos documento progrma desconhecidx${suffix}`;
  }).join("\n");
  const editor = page.getByRole("textbox", { name: "Editor de texto" });
  let start = await now();
  await page.getByLabel("Arquivo TXT").setInputFiles({ name: "benchmark.txt", mimeType: "text/plain", buffer: Buffer.from(text, "utf8") });
  await settled();
  result.timingsMs.warmDictionaryTxtImportToReady = Number(
    ((await now()) - start).toFixed(2),
  );
  await page.getByRole("button", { name: "Novo texto", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".status-left")?.textContent?.includes("0 palavras"));
  start = await now();
  await editor.evaluate((element, contents) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", contents);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, text);
  await settled();
  result.timingsMs.warmDictionaryPlainTextPasteToReady = Number(((await now()) - start).toFixed(2));
  await editor.press("Control+End");
  start = await now();
  await page.keyboard.insertText(" programa");
  await settled();
  result.timingsMs.incrementalParagraphEditToReady = Number(
    ((await now()) - start).toFixed(2),
  );
  await page.evaluate(() => {
    window.__grafelumeBenchmark.frames = [];
  });
  start = await now();
  const typingSample = " um texto claro continua aqui";
  await page.keyboard.type(typingSample, { delay: 25 });
  const typingDuration = (await now()) - start;
  await settled();
  const metrics = await page.evaluate(() => window.__grafelumeBenchmark);
  result.timingsMs.typingWholeSequence = Number(typingDuration.toFixed(2));
  result.timingsMs.typingThenSettled = Number(
    ((await now()) - start).toFixed(2),
  );
  result.typing = {
    characters: typingSample.length,
    requestedDelayMs: 25,
    sampledKeys: metrics.frames.length,
    eventToFrameMedianMs: percentile(metrics.frames, 0.5),
    eventToFrameP95Ms: percentile(metrics.frames, 0.95),
    eventToFrameMaxMs: percentile(metrics.frames, 1),
  };
  result.mainThreadLongTasks = {
    count: metrics.longTasks.length,
    totalMs: Number(
      metrics.longTasks.reduce((sum, value) => sum + value, 0).toFixed(2),
    ),
    maximumMs: percentile(metrics.longTasks, 1),
  };
  result.observed = {
    issueCount: Number(
      (await page.locator(".issue-status").innerText()).replace(/\D/g, ""),
    ),
    wordCount: (await page.locator(".status-left").innerText()).match(
      /[\d.]+ palavras?/,
    )?.[0],
    status: await page.locator(".checker-state").innerText(),
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/performance.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
}
