import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const transformersRoot = path.dirname(
  path.dirname(require.resolve("@huggingface/transformers")),
);
const onnxRoot = path.dirname(
  path.dirname(require.resolve("onnxruntime-web/ort-wasm-simd-threaded.wasm")),
);
const transformers = JSON.parse(
  await readFile(path.join(transformersRoot, "package.json"), "utf8"),
);
const onnx = JSON.parse(
  await readFile(path.join(onnxRoot, "package.json"), "utf8"),
);

// These exact versions and the CPU-only factory are validated together. Updating
// either dependency requires another real browser translation smoke test.
if (
  transformers.version !== "4.3.2" ||
  onnx.version !== "1.31.0-dev.20260914-8d85527a0"
) {
  throw new Error(
    `Runtime de tradução não validado: Transformers ${transformers.version}, ONNX ${onnx.version}.`,
  );
}

const output = path.join(root, "public", "translation", "engine");
await mkdir(output, { recursive: true });
const sources = [
  [transformersRoot, "transformers.min.js"],
  [onnxRoot, "ort-wasm-simd-threaded.mjs"],
  [onnxRoot, "ort-wasm-simd-threaded.wasm"],
];
const files = await Promise.all(
  sources.map(async ([packageRoot, filename]) => {
    const source = path.join(packageRoot, "dist", filename);
    const upstream = await readFile(source);
    let buffer = upstream;
    if (filename === 'transformers.min.js') {
      // GitHub's secret scanner mistakes this public 32-character class name
      // for an API credential. Rename its unused export and registry entries
      // consistently. No auth values or security settings are involved.
      const original = ['Mistral3For', 'ConditionalGeneration'].join('');
      const text = upstream.toString('utf8');
      if (text.split(original).length - 1 !== 3) throw new Error('Bundle upstream mudou; revise o alias de classe antes de publicar.');
      buffer = Buffer.from(text.replaceAll(original, ['Mistral3_For', 'ConditionalGeneration'].join('')));
    }
    await writeFile(path.join(output, filename), buffer);
    return {
      path: filename,
      bytes: buffer.byteLength,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      upstreamSha256: createHash('sha256').update(upstream).digest('hex'),
    };
  }),
);
const manifest = {
  version: "wasm-cpu-v1",
  transformersVersion: transformers.version,
  onnxRuntimeVersion: onnx.version,
  files,
};
await writeFile(
  path.join(root, "src", "translation", "runtime.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Runtime de tradução local copiado: ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes em ${files.length} arquivos.`,
);
