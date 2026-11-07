import { describe, expect, it } from "vitest";
import {
  splitForTokens,
  translationSegments,
} from "../../src/translation/segments";

const characters = (text: string) => Array.from(text).length;

describe("translation sentence segments", () => {
  it.each(["pt-BR", "en-US"] as const)(
    "keeps every %s sentence separate and preserves spacing around it",
    (language) => {
      const text = "  Olá, mundo!\t Como vai?  Até amanhã. ";
      const segments = translationSegments(text, language);
      expect(segments).toEqual([
        { text: "  ", translate: false },
        { text: "Olá, mundo!", translate: true },
        { text: "\t ", translate: false },
        { text: "Como vai?", translate: true },
        { text: "  ", translate: false },
        { text: "Até amanhã.", translate: true },
        { text: " ", translate: false },
      ]);
      expect(segments.map((segment) => segment.text).join("")).toBe(text);
    },
  );

  it("keeps CRLF, blank lines, indentation and Unicode line separators literal", () => {
    const text = "\tPrimeira linha\r\n\r\n  Segunda linha\n\t\rTerceira\u2028Quarta\u2029";
    const segments = translationSegments(text, "pt-BR");
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.filter((segment) => segment.translate)).toEqual([
      { text: "Primeira linha", translate: true },
      { text: "Segunda linha", translate: true },
      { text: "Terceira", translate: true },
      { text: "Quarta", translate: true },
    ]);
    expect(segments.filter((segment) => !segment.translate)).toEqual([
      { text: "\t", translate: false },
      { text: "\r\n\r\n  ", translate: false },
      { text: "\n\t\r", translate: false },
      { text: "\u2028", translate: false },
      { text: "\u2029", translate: false },
    ]);
  });

  it("preserves astral characters, decomposed accents and nonbreaking spaces", () => {
    const text = "\u00a0😀 A ac\u0327a\u0303o começou.  𐐀 works!\u00a0";
    const segments = translationSegments(text, "en-US");
    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(segments.filter((segment) => segment.translate).map((segment) => segment.text)).toEqual([
      "😀 A ac\u0327a\u0303o começou.",
      "𐐀 works!",
    ]);
    expect(segments[0]).toEqual({ text: "\u00a0", translate: false });
    expect(segments.at(-1)).toEqual({ text: "\u00a0", translate: false });
  });

  it("keeps punctuation-only and whitespace-only input out of the translator", () => {
    for (const text of ["?! … — 😀", "\r\n \t\n", ""]) {
      const segments = translationSegments(text, "pt-BR");
      expect(segments.every((segment) => !segment.translate)).toBe(true);
      expect(segments.map((segment) => segment.text).join("")).toBe(text);
    }
    expect(translationSegments("", "pt-BR")).toEqual([]);
    expect(translationSegments("2026.", "pt-BR")).toEqual([
      { text: "2026.", translate: true },
    ]);
  });

  it("does not group consecutive short sentences for one model invocation", () => {
    expect(translationSegments("Hello. Good morning. Goodbye.", "en-US")).toEqual([
      { text: "Hello.", translate: true },
      { text: " ", translate: false },
      { text: "Good morning.", translate: true },
      { text: " ", translate: false },
      { text: "Goodbye.", translate: true },
    ]);
  });
});

describe("token-limited translation chunks", () => {
  it("returns empty input without requesting a token count", () => {
    expect(splitForTokens("", () => { throw new Error("unexpected count"); })).toEqual([]);
  });

  it("keeps a sentence that fits, including the exact boundary", () => {
    expect(splitForTokens("ação 😀", characters, 6)).toEqual(["ação 😀"]);
    expect(splitForTokens("a".repeat(380), characters)).toEqual(["a".repeat(380)]);
  });

  it("prefers word boundaries while preserving every separator", () => {
    const text = "um dois  três\r\nquatro";
    const chunks = splitForTokens(text, characters, 8);
    expect(chunks).toEqual(["um dois", "  três\r\n", "quatro"]);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((chunk) => characters(chunk) <= 8)).toBe(true);
  });

  it("splits long words at Unicode code points without cutting astral pairs", () => {
    const text = "𐐀".repeat(9) + "ac\u0327a\u0303o😀".repeat(5);
    const chunks = splitForTokens(text, characters, 4);
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => characters(chunk) <= 4)).toBe(true);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
    }
  });

  it("counts actual tokenizer overhead for every emitted chunk", () => {
    const count = (text: string) => 2 + characters(text);
    const text = "ação extraordinariamente longa 😀";
    const chunks = splitForTokens(text, count, 8);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((chunk) => count(chunk) <= 8)).toBe(true);
    expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
  });

  it("handles token counts that decrease after adding another character", () => {
    const count = (text: string) => text === "abc" ? 2 : characters(text);
    const text = "abc abcdef abc";
    const chunks = splitForTokens(text, count, 3);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((chunk) => count(chunk) <= 3)).toBe(true);
  });

  it("rejects an indivisible character that exceeds the token budget", () => {
    expect(() => splitForTokens("😀", () => 4, 3)).toThrow("Um único caractere");
  });

  it("rejects invalid budgets and token counts", () => {
    for (const limit of [0, -1, 1.5, Infinity, NaN]) {
      expect(() => splitForTokens("texto", characters, limit)).toThrow("inteiro positivo");
    }
    for (const count of [-1, 1.5, Infinity, NaN]) {
      expect(() => splitForTokens("texto", () => count)).toThrow("inteiro não negativo");
    }
  });
});
