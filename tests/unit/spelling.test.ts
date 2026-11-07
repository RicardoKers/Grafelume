import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SpellChecker } from "../../src/spelling/SpellChecker";
import { DocumentChecker } from "../../src/spelling/DocumentChecker";
import { tokenize } from "../../src/spelling/TextTokenizer";
import { loadDictionary } from "../../src/spelling/DictionaryManager";

function dictionary(code: string) {
  return SpellChecker.create(
    readFileSync(`node_modules/dictionary-${code}/index.aff`, "utf8"),
    readFileSync(`node_modules/dictionary-${code}/index.dic`, "utf8"),
  );
}

describe("Hunspell dictionaries (real data)", () => {
  let pt: SpellChecker;
  let en: SpellChecker;
  beforeAll(async () => {
    pt = await dictionary("pt");
    en = await dictionary("en");
  }, 30_000);

  it("recognizes Portuguese accents, plurals, conjugations and capitalization", () => {
    for (const word of [
      "programa",
      "documento",
      "ação",
      "coração",
      "crianças",
      "documentos",
      "escrevemos",
      "Programa",
      "PROGRAMAS",
    ])
      expect(pt.check(word), word).toBe(true);
    for (const word of ["progrma", "ortogrfia", "escrevmeos"])
      expect(pt.check(word), word).toBe(false);
  });

  it("normalizes decomposed Unicode while retaining token positions", () => {
    expect(pt.check("ac\u0327a\u0303o")).toBe(true);
    const text = "🌟 ac\u0327a\u0303o progrma";
    for (const token of tokenize(text, "pt-BR"))
      expect(text.slice(token.from, token.to)).toBe(token.text);
  });

  it("offers programa for progrma, with a maximum of five suggestions", () => {
    expect(pt.suggest("progrma")).toContain("programa");
    expect(pt.suggest("progrma", 2)).toHaveLength(2);
    expect(pt.suggest("progrma", 50).length).toBeLessThanOrEqual(5);
    expect(pt.suggest("programa")).toEqual([]);
  });

  it("recognizes US English, affixes and apostrophes", () => {
    for (const word of [
      "color",
      "writing",
      "documents",
      "running",
      "don't",
      "beautiful",
      "Color",
    ])
      expect(en.check(word), word).toBe(true);
    expect(en.check("writting")).toBe(false);
    expect(en.suggest("writting")).toContain("writing");
    expect(en.check("colour")).toBe(false);
    expect(en.check("coração")).toBe(false);
    expect(pt.check("coração")).toBe(true);
  });

  it("keeps known hyphenated words together, and does not ignore unknown compounds", () => {
    expect(
      tokenize("guarda-chuva progrma-errda", "pt-BR").map((t) => t.text),
    ).toEqual(["guarda-chuva", "progrma-errda"]);
    expect(pt.check("guarda-chuva")).toBe(true);
    expect(pt.check("progrma-errda")).toBe(false);
    expect(en.check("don’t")).toBe(true);
  });

  it("adds and removes personal words independently per language", () => {
    expect(pt.check("Grafelume")).toBe(false);
    pt.setPersonal(["Grafelume"]);
    expect(pt.check("Grafelume")).toBe(true);
    expect(pt.check("grafelume")).toBe(true);
    expect(en.check("Grafelume")).toBe(false);
    pt.setPersonal([]);
    expect(pt.check("Grafelume")).toBe(false);
  });

  it("keeps grammar out of spelling and rechecks personal/ignored changes", () => {
    const doc = new DocumentChecker(pt, "pt-BR");
    expect(
      doc.check("Este programa permite verificar a ortografia dos documento."),
    ).toEqual([]);
    expect(doc.check("progrma progrma")).toHaveLength(2);
    expect(doc.check("progrma progrma", ["progrma"])).toEqual([]);
    pt.setPersonal(["progrma"]);
    expect(doc.check("progrma progrma")).toEqual([]);
    pt.setPersonal([]);
    expect(doc.check("progrma progrma")).toHaveLength(2);
  });

  it("preserves UTF-16 offsets through incremental paragraph edits", () => {
    const doc = new DocumentChecker(pt, "pt-BR");
    doc.check("Este progrma\nprograma progrma");
    const text = "🌟 Este programa\nprograma progrma";
    const result = doc.check(text);
    expect(result).toHaveLength(1);
    expect(text.slice(result[0]!.from, result[0]!.to)).toBe("progrma");
    expect(result[0]!.from).toBe(text.lastIndexOf("progrma"));
  });

  it("measures a 10,000-word document with unknown terms without an artificial latency assertion", () => {
    const doc = new DocumentChecker(pt, "pt-BR");
    const text = Array.from({ length: 1_000 }, (_, i) => {
      const suffix = [Math.floor(i / 676), Math.floor(i / 26) % 26, i % 26]
        .map((part) => String.fromCharCode(97 + part))
        .join("");
      return `Este programa permite verificar a ortografia dos documento progrma desconhecidx${suffix}`;
    }).join("\n");
    const start = performance.now();
    const result = doc.check(text);
    const cold = performance.now() - start;
    const warmStart = performance.now();
    const changed = doc.check(text + "\nprogrma");
    const warm = performance.now() - warmStart;
    expect(result).toHaveLength(2_000);
    expect(changed).toHaveLength(2_001);
    console.info(
      `SPELL_PERFORMANCE words=10000 unknown=2000 cold=${cold.toFixed(2)}ms incremental=${warm.toFixed(2)}ms node=${process.version}`,
    );
  });

  it("rejects corrupted dictionary files", async () => {
    await expect(
      SpellChecker.create("<html>Offline</html>", "oops"),
    ).rejects.toThrow("Dicionário inválido");
  });

  it("recovers from failed downloads and shares a same-origin loading promise", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(loadDictionary("pt-BR")).rejects.toThrow(
        "Conecte-se e tente novamente",
      );
      fetcher.mockImplementation(async (url: string) => {
        expect(url).toMatch(/^\/dictionaries\/pt-BR\.(aff|dic)$/);
        return new Response(
          readFileSync(
            `node_modules/dictionary-pt/index.${url.endsWith(".aff") ? "aff" : "dic"}`,
            "utf8",
          ),
        );
      });
      const first = loadDictionary("pt-BR");
      const second = loadDictionary("pt-BR");
      expect(first).toBe(second);
      expect((await first).check("programa")).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(4);
      fetcher.mockResolvedValue(new Response("Unavailable", { status: 503 }));
      await expect(loadDictionary("en-US")).rejects.toThrow(
        "Não foi possível carregar o dicionário en-US",
      );
      fetcher.mockImplementation(
        async (url: string) =>
          new Response(
            readFileSync(
              `node_modules/dictionary-en/index.${url.endsWith(".aff") ? "aff" : "dic"}`,
              "utf8",
            ),
          ),
      );
      expect((await loadDictionary("en-US")).check("color")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("technical-token filtering", () => {
  it("filters URLs, email, IP, file paths, variables, acronyms, numbers and units", () => {
    const text =
      "https://example.com/naosei nome@example.com 192.168.1.1 C:\\docs\\arquivo.txt /tmp/foo.txt snake_case camelCase AB12 NASA 42 12kg 20 MHz progrma";
    expect(tokenize(text, "pt-BR").map((t) => t.text)).toEqual(["progrma"]);
  });

  it("lets users disable technical exclusions without hiding ordinary unknown words", () => {
    expect(
      tokenize("progrma NASA snake_case", "pt-BR", false).map((t) => t.text),
    ).toEqual(["progrma", "NASA", "snake", "case"]);
    expect(tokenize("naoseioq", "pt-BR")).toHaveLength(1);
  });

  it("protects Unicode identifiers, relative paths and quoted Windows paths", () => {
    const text =
      'á_variável variávelNome src/components/App.vue arquivo.txt "C:\\Program Files\\app.txt" progrma';
    expect(tokenize(text, "pt-BR").map((t) => t.text)).toEqual(["progrma"]);
  });

  it("retains apostrophes, hyphens and Unicode offsets", () => {
    expect(
      tokenize("🌟 don't guarda-chuva d’água", "en-US").map((t) => [
        t.text,
        t.from,
      ]),
    ).toEqual([
      ["don't", 3],
      ["guarda-chuva", 9],
      ["d’água", 22],
    ]);
  });
});
