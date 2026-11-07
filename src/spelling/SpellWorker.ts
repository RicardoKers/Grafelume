/// <reference lib="webworker" />
import type { Issue, Language } from "../types";
import { loadDictionary } from "./DictionaryManager";
import { DocumentChecker } from "./DocumentChecker";

type CheckRequest = {
  id: number;
  type: "check";
  language: Language;
  text: string;
  personal: string[];
  ignored: string[];
  ignoreTechnical: boolean;
};
type SuggestRequest = {
  id: number;
  type: "suggest";
  language: Language;
  word: string;
  limit?: number;
};
const documents = new Map<Language, DocumentChecker>();

self.onmessage = async (event: MessageEvent<CheckRequest | SuggestRequest>) => {
  const request = event.data;
  try {
    const checker = await loadDictionary(request.language);
    if (request.type === "suggest") {
      self.postMessage({
        id: request.id,
        suggestions: checker.suggest(request.word, request.limit),
      });
      return;
    }
    checker.setPersonal(request.personal);
    let document = documents.get(request.language);
    if (!document) {
      document = new DocumentChecker(checker, request.language);
      documents.set(request.language, document);
    }
    const issues: Issue[] = document.check(
      request.text,
      request.ignored,
      request.ignoreTechnical,
    );
    self.postMessage({ id: request.id, issues });
  } catch (error) {
    self.postMessage({
      id: request.id,
      issues: [],
      suggestions: [],
      error:
        error instanceof Error
          ? error.message
          : "Falha ao carregar o corretor. Tente novamente.",
    });
  }
};
