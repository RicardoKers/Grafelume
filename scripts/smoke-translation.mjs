// Manual integration test: node scripts/smoke-translation.mjs
// Requires the staged models, copied runtime, and Playwright's Chromium.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = path.join(root, "public");
const port = Number(process.env.TRANSLATION_SMOKE_PORT ?? 4175);
const origin = `http://127.0.0.1:${port}`;
const base = `${origin}/Grafelume/`;
const requests = [];
const errors = [];
const worker = `
let tokenizer, model, library, direction;
async function translate(text) {
  const started = performance.now();
  const ids = tokenizer.encode(text);
  if (direction === 'en-pt') ids.unshift(51);
  if (ids.length > 512) throw new Error('Probe exceeded Marian input limit');
  const encoded = new BigInt64Array(ids.map(BigInt));
  const mask = new BigInt64Array(ids.length).fill(1n);
  const output = await model.generate({
    input_ids: new library.Tensor('int64', encoded, [1, ids.length]),
    attention_mask: new library.Tensor('int64', mask, [1, ids.length]),
    max_new_tokens: 128, num_beams: 1, do_sample: false,
  });
  return {
    text: tokenizer.batch_decode(output, {skip_special_tokens: true})[0],
    inputTokens: ids.length,
    firstId: ids[0],
    elapsedMs: Math.round(performance.now() - started),
    crossOriginIsolated,
  };
}
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      direction = data.direction;
      library = await import('${base}translation/engine/transformers.min.js');
      const {env, AutoTokenizer, AutoModelForSeq2SeqLM} = library;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = '/Grafelume/translation/models/';
      env.useBrowserCache = false;
      env.useFSCache = false;
      env.useWasmCache = false;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      env.backends.onnx.wasm.wasmPaths = {
        mjs: '${base}translation/engine/ort-wasm-simd-threaded.mjs',
        wasm: '${base}translation/engine/ort-wasm-simd-threaded.wasm',
      };
      const originalFetch = env.fetch;
      env.fetch = (url, options) => {
        const target = new URL(String(url), self.location.href);
        if (target.origin !== '${origin}' || !target.pathname.startsWith('/Grafelume/translation/')) {
          throw new Error('Unexpected inference fetch: ' + target.href);
        }
        return originalFetch(target, options);
      };
      [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(direction, {local_files_only: true}),
        AutoModelForSeq2SeqLM.from_pretrained(direction, {
          local_files_only: true, dtype: 'q8', device: 'wasm',
        }),
      ]);
    }
    self.postMessage({result: await translate(data.text)});
  } catch (error) {
    self.postMessage({error: error.stack ?? String(error)});
  }
};
`;
const csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'";
const server = createServer(async (request, response) => {
  requests.push({ method: request.method, url: request.url });
  response.setHeader("Content-Security-Policy", csp);
  try {
    const pathname = new URL(request.url, origin).pathname;
    if (pathname === "/Grafelume/") {
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><title>Local translation probe</title>");
      return;
    }
    if (pathname === "/Grafelume/probe-worker.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(worker);
      return;
    }
    const filename = path.resolve(publicRoot, pathname.slice("/Grafelume/".length));
    if (!pathname.startsWith("/Grafelume/") || !filename.startsWith(publicRoot + path.sep)) {
      response.writeHead(404).end();
      return;
    }
    const information = await stat(filename);
    if (!information.isFile()) throw new Error("Not a file");
    const mime = {
      ".js": "application/javascript",
      ".mjs": "application/javascript",
      ".json": "application/json",
      ".wasm": "application/wasm",
    }[path.extname(filename)] ?? "application/octet-stream";
    response.setHeader("Content-Type", mime);
    response.setHeader("Content-Length", information.size);
    response.end(await readFile(filename));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      errors.push(`External request: ${route.request().url()}`);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(base);
  const outputs = [];
  for (const [direction, text, offlineText, expected] of [
    ["en-pt", "The house is blue.", "The editor works without a connection.", /casa.*azul/i],
    ["pt-en", "A casa é azul.", "O editor funciona sem conexão.", /house.*blue/i],
  ]) {
    const online = await page.evaluate(({ direction, text, base }) => new Promise((resolve, reject) => {
      window.probeWorker = new Worker(base + "probe-worker.js", { type: "module" });
      window.probeWorker.onerror = (event) => reject(new Error(event.message));
      window.probeWorker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.result);
      window.probeWorker.postMessage({ type: "init", direction, text });
    }), { direction, text, base });
    assert.match(online.text, expected);
    assert.equal(online.crossOriginIsolated, false);
    if (direction === "en-pt") assert.equal(online.firstId, 51);
    await context.setOffline(true);
    const count = requests.length;
    const offline = await page.evaluate((text) => new Promise((resolve, reject) => {
      window.probeWorker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.result);
      window.probeWorker.postMessage({ type: "offline", text });
    }), offlineText);
    assert.ok(offline.text.trim());
    assert.notEqual(offline.text, offlineText);
    assert.equal(requests.length, count);
    outputs.push({ direction, online, offline });
    await page.evaluate(() => window.probeWorker.terminate());
    await context.setOffline(false);
  }
  assert.deepEqual(errors, []);
  assert.ok(requests.every((request) => request.method === "GET"));
  console.log(JSON.stringify({ outputs, requests: requests.length, externalRequests: 0, csp }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
