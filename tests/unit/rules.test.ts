import { describe, expect, it } from "vitest";
import { reviewText } from "../../src/grammar/RuleEngine";

function apply(text: string) {
  for (const issue of reviewText(text).reverse()) {
    text =
      text.slice(0, issue.from) + issue.suggestions[0] + text.slice(issue.to);
  }
  return text;
}

describe("deterministic review rules", () => {
  it("fixes duplicate spaces while retaining intentional indentation", () => {
    expect(apply("Um  texto.\n    Indentado.")).toBe(
      "Um texto.\n    Indentado.",
    );
  });
  it("removes space before punctuation and preserves the punctuation", () => {
    expect(apply("Olá , mundo !")).toBe("Olá, mundo!");
  });
  it("detects consecutive words with case and accent support", () => {
    const text = "Ação ação é uma uma palavra.";
    expect(
      reviewText(text).filter((issue) => issue.rule === "repeated-word"),
    ).toHaveLength(2);
    expect(apply(text)).toBe("Ação é uma palavra.");
  });
  it("keeps words on different lines and different hyphenated words", () => {
    expect(reviewText("sim\nsim\nguarda-chuva guarda-sol")).toEqual([]);
  });
  it("fixes accidentally duplicated punctuation", () => {
    expect(apply("Olá,, mundo..")).toBe("Olá, mundo.");
    expect(reviewText("Talvez... Sério?! Sim!!")).toEqual([]);
  });
  it("adds spaces in unambiguous punctuation cases", () => {
    expect(apply("Olá,mundo;vamos!Sim?Claro")).toBe(
      "Olá, mundo; vamos! Sim? Claro",
    );
  });
  it("preserves URLs, emails, identifiers, decimals and abbreviations", () => {
    expect(
      reviewText(
        "https://example.com/a,b?c=d foo@example.com 3.14 192.168.0.1 my_var foo.bar Sr.Silva `x,,y`",
      ),
    ).toEqual([]);
  });
  it("removes trailing spaces and excess newlines preserving CRLF", () => {
    expect(apply("Texto  \r\n\r\n\r\nOutro\t")).toBe("Texto\r\n\r\nOutro");
  });
  it("emits correct UTF-16 offsets and non-overlapping fixes", () => {
    const text = "😀 uma  uma palavra ,fim.";
    const issues = reviewText(text);
    expect(issues[0]?.from).toBe(3);
    for (let i = 0; i < issues.length; i++) {
      const issue = issues[i]!;
      expect(text.slice(issue.from, issue.to)).toBe(issue.text);
      if (i > 0) expect(issue.from).toBeGreaterThanOrEqual(issues[i - 1]!.to);
    }
    expect(apply(text)).toBe("😀 uma palavra,fim."); // A second pass can add the missing space.
    expect(apply(apply(text))).toBe("😀 uma palavra, fim.");
  });
  it("does not confuse orthography with grammar", () => {
    expect(
      reviewText("Este programa permite verificar a ortografia dos documento."),
    ).toEqual([]);
  });
});
