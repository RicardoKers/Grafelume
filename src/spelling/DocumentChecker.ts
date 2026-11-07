import type { Issue, Language } from "../types";
import { SpellChecker, normalizeWord } from "./SpellChecker";
import { tokenize, type Token } from "./TextTokenizer";

/** Reuse tokenized unchanged paragraphs and memoized word checks across edits. */
export class DocumentChecker {
  private paragraphs = new Map<string, Token[]>();
  private mode: boolean | undefined;
  constructor(
    private readonly engine: SpellChecker,
    private readonly language: Language,
  ) {}

  check(text: string, ignored: string[] = [], ignoreTechnical = true): Issue[] {
    if (this.mode !== ignoreTechnical) this.paragraphs.clear();
    this.mode = ignoreTechnical;
    const session = new Set(
      ignored.map((word) => normalizeWord(word).toLocaleLowerCase()),
    );
    const nextParagraphs = new Map<string, Token[]>();
    const issues: Issue[] = [];
    let offset = 0;
    for (const paragraph of text.split("\n")) {
      let tokens =
        this.paragraphs.get(paragraph) ?? nextParagraphs.get(paragraph);
      if (!tokens) tokens = tokenize(paragraph, this.language, ignoreTechnical);
      nextParagraphs.set(paragraph, tokens);
      for (const token of tokens) {
        if (
          session.has(normalizeWord(token.text).toLocaleLowerCase()) ||
          this.engine.check(token.text)
        )
          continue;
        const from = offset + token.from;
        const to = offset + token.to;
        issues.push({
          id: `spelling:${from}:${to}:${token.text}`,
          from,
          to,
          text: token.text,
          category: "spelling",
          message: "Palavra não encontrada no dicionário",
          suggestions: [],
        });
      }
      offset += paragraph.length + 1;
    }
    // Old paragraphs are released; there is no unbounded document history in the worker.
    this.paragraphs = nextParagraphs;
    return issues;
  }
}
