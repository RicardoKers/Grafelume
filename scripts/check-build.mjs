import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const base = "/Grafelume/";
const origin = "https://ricardokers.github.io";
const index = await readFile(path.join(root, "index.html"), "utf8");

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    ),
  );
  return nested.flat();
}

async function assertLocalResource(resource, parent = `${origin}${base}`) {
  const url = new URL(resource, parent);
  assert.equal(url.origin, origin, `Recurso externo inesperado: ${resource}`);
  assert.ok(url.pathname.startsWith(base), `Recurso fora da base: ${resource}`);
  const relative = decodeURIComponent(url.pathname.slice(base.length));
  assert.ok(
    relative && !relative.includes(".."),
    `Caminho inválido: ${resource}`,
  );
  await readFile(path.join(root, relative));
}

for (const [, resource] of index.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  if (!resource.startsWith("#") && !resource.startsWith("data:"))
    await assertLocalResource(resource);
}

const manifest = JSON.parse(
  await readFile(path.join(root, "manifest.webmanifest"), "utf8"),
);
assert.equal(manifest.display, "standalone");
assert.match(manifest.name, /Grafelume/);
const manifestUrl = `${origin}${base}manifest.webmanifest`;
assert.equal(new URL(manifest.start_url, manifestUrl).pathname, base);
assert.equal(new URL(manifest.scope, manifestUrl).pathname, base);
assert.ok(
  manifest.icons.some((icon) => icon.purpose?.split(" ").includes("maskable")),
  "Ícone maskable ausente",
);
for (const icon of manifest.icons)
  await assertLocalResource(icon.src, manifestUrl);
for (const size of [192, 512]) {
  const png = await readFile(path.join(root, `icons/icon-${size}.png`));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}

const output = await files(root);
const wasmFiles = output.filter((file) => file.endsWith(".wasm"));
assert.ok(wasmFiles.length > 0, "Binário Hunspell WASM ausente do build");
for (const file of wasmFiles) {
  const binary = await readFile(file);
  assert.deepEqual(
    [...binary.subarray(0, 4)],
    [0, 97, 115, 109],
    "Formato WebAssembly inválido",
  );
}
const worker = await readFile(path.join(root, "sw.js"), "utf8");
assert.ok(/\.wasm/.test(worker), "WebAssembly não entrou no precache offline");
assert.ok(
  /dictionaries/.test(worker),
  "Rota dos dicionários não encontrada no Service Worker",
);
assert.ok(
  /CacheFirst/.test(worker),
  "Cache dos dicionários precisa evitar downloads repetidos",
);
assert.ok(
  worker.includes("grafelume-dictionaries-v1"),
  "Nome versionado do cache de dicionários ausente",
);

for (const language of ["pt-BR", "en-US"]) {
  const aff = await readFile(
    path.join(root, `dictionaries/${language}.aff`),
    "utf8",
  );
  const dic = await readFile(
    path.join(root, `dictionaries/${language}.dic`),
    "utf8",
  );
  assert.ok(/^SET\s+UTF-8/m.test(aff), `Afixos inválidos: ${language}`);
  assert.ok(/^\uFEFF?\d+\s*\r?\n/.test(dic), `Léxico inválido: ${language}`);
  await readFile(path.join(root, `dictionaries/${language}.LICENSE`));
}
for (const notice of [
  "COPYING",
  "COPYING.LESSER",
  "COPYING.MPL",
  "SOURCE.txt",
]) {
  await readFile(path.join(root, "engine", notice));
}
const notices = await readFile(
  path.join(root, "licenses/THIRD-PARTY-NOTICES.txt"),
  "utf8",
);
assert.ok(notices.includes("hunspell-wasm"), "Avisos Hunspell ausentes");
assert.ok(notices.includes("@lucide/vue"), "Avisos Lucide ausentes");
assert.ok(notices.includes('@huggingface/transformers'), 'Avisos de tradução ausentes');
const models = JSON.parse(await readFile(new URL('../src/translation/models.json', import.meta.url), 'utf8'));
const runtime = JSON.parse(await readFile(new URL('../src/translation/runtime.json', import.meta.url), 'utf8'));
for (const asset of [
  ...runtime.files.map(file => ({ ...file, path: `translation/engine/${file.path}` })),
  ...models.flatMap(model => [...model.files, ...model.notices].map(file => ({ ...file, path: `translation/models/${model.id}/${file.path}` }))),
]) {
  const binary = await readFile(path.join(root, asset.path));
  assert.equal(binary.length, asset.bytes, `Tamanho divergente: ${asset.path}`);
  assert.equal(createHash('sha256').update(binary).digest('hex'), asset.sha256, `Hash divergente: ${asset.path}`);
  assert.ok(!worker.includes(asset.path), `Modelo/runtime entrou no precache automático: ${asset.path}`);
}
assert.ok(worker.includes('grafelume-translation-v1') && worker.includes('CacheOnly'), 'Cache explícito de tradução ausente');

console.log(
  `Build verificado: base ${base}, manifesto, ícones, WASM Hunspell em precache, dois dicionários, tradução íntegra sob demanda e avisos.`,
);
