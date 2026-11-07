import { Hunspell, getWasmModule } from "hunspell-wasm";

let modulePromise: Promise<unknown> | undefined;

/** Local Hunspell engine; spelling checks never make network requests. */
export class SpellChecker {
  private readonly checks = new Map<string, boolean>();
  private readonly suggestions = new Map<string, string[]>();
  private personal = new Set<string>();

  private constructor(private readonly engine: Hunspell) {}

  static async create(aff: string, dic: string): Promise<SpellChecker> {
    if (
      !/^SET UTF-8\s*$/m.test(aff) ||
      !/^\d+\s*$/m.test(dic.split("\n", 1)[0] ?? "")
    ) {
      throw new Error(
        "Dicionário inválido: são necessários arquivos Hunspell UTF-8.",
      );
    }
    modulePromise ??= getWasmModule().catch((error) => {
      modulePromise = undefined;
      throw error;
    });
    const module = await modulePromise;
    return new SpellChecker(new Hunspell(module, aff, dic));
  }

  setPersonal(words: string[]): void {
    // Keeping user words separate permits removal without mutating the base dictionary.
    this.personal = new Set(
      words.map((word) => word.normalize("NFC").toLocaleLowerCase()),
    );
  }

  check(input: string): boolean {
    const word = normalizeWord(input);
    if (this.personal.has(word.toLocaleLowerCase())) return true;
    const cached = this.checks.get(word);
    if (cached !== undefined) return cached;
    const result = this.engine.testSpelling(word);
    if (this.checks.size >= 30_000) this.checks.clear();
    this.checks.set(word, result);
    return result;
  }

  suggest(input: string, limit = 5): string[] {
    const word = normalizeWord(input);
    // Extremely long tokens have no useful edit-distance suggestions; checking still works.
    if (!word || word.length > 64 || this.check(word)) return [];
    let found = this.suggestions.get(word);
    if (!found) {
      found = [...new Set(this.engine.getSpellingSuggestions(word))];
      if (this.suggestions.size >= 2_000) this.suggestions.clear();
      this.suggestions.set(word, found);
    }
    return found.slice(0, Math.max(1, Math.min(5, limit)));
  }
}

export function normalizeWord(word: string): string {
  return word.normalize("NFC").replace(/[’]/g, "'").replace(/[‐‑]/g, "-");
}
