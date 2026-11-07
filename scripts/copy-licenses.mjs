import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const lock = JSON.parse(
  await readFile(path.join(root, "package-lock.json"), "utf8"),
);
const chunks = [
  "Grafelume — third-party production notices\n",
  "Generated from the installed package-lock.json by scripts/copy-licenses.mjs.\n",
  "Original license terms apply to each component.\n",
  "Dictionary licenses are distributed separately in dictionaries/.\n",
];
let count = 0;
for (const [relative, information] of Object.entries(lock.packages).sort(
  ([a], [b]) => a.localeCompare(b),
)) {
  if (!relative) continue;
  const name = relative.split("node_modules/").at(-1);
  // Transformers' optional Node image backend installs platform libvips
  // binaries. The browser-only translation runtime never copies or loads them;
  // they are not part of the deployed artifact (and Linux archives omit LICENSE).
  if (name.startsWith('@img/sharp-libvips-')) continue;
  // Workbox is a build dependency that also contributes the deployed SW runtime.
  if (information.dev && !name.startsWith("workbox-")) continue;
  const folder = path.join(root, relative);
  let metadata;
  try {
    metadata = JSON.parse(
      await readFile(path.join(folder, "package.json"), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT" && information.optional) continue;
    throw error;
  }
  const entries = await readdir(folder, { withFileTypes: true });
  const licenses = entries.filter(
    (entry) =>
      entry.isFile() &&
      /^(licen[cs]e|copying|copyright|notice)(\.|$|-)/i.test(entry.name),
  );
  const vendorNotice = ['guid-typescript', 'onnxruntime-common', 'onnxruntime-node', 'onnxruntime-web'].includes(name)
    ? path.join(root, 'public', 'translation', 'engine', 'notices', name + '.txt') : undefined;
  if (!licenses.length && !vendorNotice)
    throw new Error(
      `Aviso integral ausente: ${name}. Verifique a licença antes de publicar.`,
    );
  chunks.push(
    `\n${"=".repeat(72)}\n${metadata.name} ${metadata.version}\nDeclared license: ${metadata.license ?? information.license}\n`,
  );
  if (!licenses.length && vendorNotice) chunks.push(await readFile(vendorNotice, 'utf8'));
  for (const license of licenses) {
    chunks.push(
      `\n--- ${license.name} ---\n${await readFile(path.join(folder, license.name), "utf8")}\n`,
    );
  }
  count++;
}
const output = path.join(root, "public", "licenses");
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "THIRD-PARTY-NOTICES.txt"), chunks.join(""));
console.log(
  `Avisos integrais de ${count} dependências de produção/Workbox preservados.`,
);
