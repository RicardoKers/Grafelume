import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "public", "dictionaries");
await mkdir(output, { recursive: true });
const manifest = [];
for (const [language, name] of [
  ["pt-BR", "dictionary-pt"],
  ["en-US", "dictionary-en"],
]) {
  const directory = path.join(root, "node_modules", name);
  const metadata = JSON.parse(
    await readFile(path.join(directory, "package.json"), "utf8"),
  );
  for (const extension of ["aff", "dic"])
    await copyFile(
      path.join(directory, `index.${extension}`),
      path.join(output, `${language}.${extension}`),
    );
  for (const file of ["license", "readme.md"])
    await copyFile(
      path.join(directory, file),
      path.join(
        output,
        `${language}.${file === "license" ? "LICENSE" : "README.md"}`,
      ),
    );
  manifest.push({
    language,
    package: name,
    version: metadata.version,
    license: metadata.license,
    source: metadata.repository,
  });
}
await writeFile(
  path.join(output, "sources.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const engine = path.join(root, "node_modules", "hunspell-wasm");
const engineOutput = path.join(root, "public", "engine");
await mkdir(engineOutput, { recursive: true });
for (const file of ["COPYING", "COPYING.LESSER", "COPYING.MPL", "README.md"])
  await copyFile(path.join(engine, file), path.join(engineOutput, file));
await writeFile(
  path.join(engineOutput, "SOURCE.txt"),
  [
    "hunspell-wasm 0.3.0 — código redistribuído sem modificações.",
    "Fontes do wrapper e do port: https://github.com/rotemdan/hunspell-wasm/tree/8f755ef64e8b047b77b676f9698b3dfa5cb1887d",
    "Pacote exato com fontes do wrapper: https://registry.npmjs.org/hunspell-wasm/-/hunspell-wasm-0.3.0.tgz",
    "Fontes C++ Hunspell: https://github.com/rotemdan/hunspell-wasm/tree/8f755ef64e8b047b77b676f9698b3dfa5cb1887d/lib/hunspell",
    "Instruções de build: https://github.com/rotemdan/hunspell-wasm/blob/8f755ef64e8b047b77b676f9698b3dfa5cb1887d/docs/Building.md",
    "Licença no metadado npm: LGPL-2.0 OR GPL-2.0 OR MPL-1.1. O aviso COPYING.LESSER fornecido é LGPL 2.1; consulte os textos originais nesta pasta.",
    "",
  ].join("\n"),
);
console.log(
  "Dicionários e avisos de licença copiados para public/dictionaries.",
);
