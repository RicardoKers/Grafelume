import type { Language } from "../types";
import { SpellChecker } from "./SpellChecker";

const dictionaries = new Map<Language, Promise<SpellChecker>>();

/** Same-origin static files only. Failed loads are evicted so reconnect/retry works. */
export function loadDictionary(language: Language): Promise<SpellChecker> {
  const existing = dictionaries.get(language);
  if (existing) return existing;
  const result = (async () => {
    const base = `${import.meta.env.BASE_URL}dictionaries/${language}`;
    const [aff, dic] = await Promise.all(
      ["aff", "dic"].map(async (extension) => {
        const response = await fetch(`${base}.${extension}`);
        if (!response.ok)
          throw new Error(
            `Não foi possível carregar o dicionário ${language}. Conecte-se e tente novamente.`,
          );
        return response.text();
      }),
    );
    return SpellChecker.create(aff!, dic!);
  })().catch(() => {
    dictionaries.delete(language);
    throw new Error(
      `Não foi possível carregar o dicionário ${language}. Conecte-se e tente novamente.`,
    );
  });
  dictionaries.set(language, result);
  return result;
}
