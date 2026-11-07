import type { EditorState, TransactionSpec } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import type { Issue, Language } from "../types";
import { technicalRanges, tokenize } from "../spelling/TextTokenizer";

export interface BatchEdit {
  id: string;
  from: number;
  to: number;
  text: string;
  replacement: string;
  category: "spelling" | "review";
}

export interface BatchPlan {
  snapshot: string;
  language: Language;
  edits: BatchEdit[];
}

export interface BatchPreviewItem {
  id: string;
  line: number;
  column: number;
  before: string;
  after: string;
  prefix: string;
  suffix: string;
  category: "spelling" | "review";
}

type Range = Pick<Issue, "from" | "to">;

function protectedRanges(text: string): Range[] {
  const ranges = technicalRanges(text);
  // Quoted code and technical symbols remain opaque even when the spelling
  // preference to ignore technical terms is switched off.
  for (const match of text.matchAll(
    /```[\s\S]*?```|`[^`\r\n]*`|°[CF]|[µμ](?:g|m|s)|[Ω%‰]/gu,
  )) {
    ranges.push({ from: match.index, to: match.index + match[0].length });
  }
  return ranges;
}

function isProtected(text: string, issue: Range, ranges: Range[]): boolean {
  if (ranges.some((range) => issue.from < range.to && issue.to > range.from))
    return true;
  const fragment = text.slice(issue.from, issue.to);
  // Reuse the tokenizer's unit list rather than introducing a second list that
  // could drift. Whitespace-only review occurrences are still permitted.
  return (
    tokenize(fragment, "pt-BR", false).length >
    tokenize(fragment, "pt-BR", true).length
  );
}

/** The batch path always protects recognized technical spans, independently of preferences. */
export function isBatchProtected(text: string, issue: Range): boolean {
  return isProtected(text, issue, protectedRanges(text));
}

function unicodeBoundary(text: string, position: number): boolean {
  if (position <= 0 || position >= text.length) return true;
  const current = text.charCodeAt(position),
    previous = text.charCodeAt(position - 1);
  if (
    current >= 0xdc00 &&
    current <= 0xdfff &&
    previous >= 0xd800 &&
    previous <= 0xdbff
  )
    return false;
  // A replacement must not detach combining accents from their base letter.
  return !/\p{M}/u.test(String.fromCodePoint(text.codePointAt(position)!));
}

/** Validate the whole batch before creating any document changes. */
export function validateBatch(
  text: string,
  edits: readonly BatchEdit[],
): BatchEdit[] {
  if (!edits.length)
    throw new Error("Selecione pelo menos uma correção para o lote.");
  const ordered = edits
    .map((edit) => ({
      id: edit.id,
      from: edit.from,
      to: edit.to,
      text: edit.text,
      replacement: edit.replacement,
      category: edit.category,
    }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const ranges = protectedRanges(text),
    ids = new Set<string>();
  let previous: BatchEdit | undefined;
  for (const edit of ordered) {
    if (
      !edit.id ||
      typeof edit.id !== "string" ||
      !Number.isInteger(edit.from) ||
      !Number.isInteger(edit.to) ||
      edit.from < 0 ||
      edit.to > text.length ||
      edit.from >= edit.to ||
      typeof edit.text !== "string" ||
      typeof edit.replacement !== "string" ||
      (edit.category !== "spelling" && edit.category !== "review") ||
      !unicodeBoundary(text, edit.from) ||
      !unicodeBoundary(text, edit.to)
    ) {
      throw new Error(
        "Uma das correções tem um intervalo inválido. Selecione-a novamente.",
      );
    }
    if (ids.has(edit.id))
      throw new Error("A mesma ocorrência foi selecionada mais de uma vez.");
    ids.add(edit.id);
    if (text.slice(edit.from, edit.to) !== edit.text) {
      throw new Error(
        "O trecho mudou. Selecione novamente as correções do lote.",
      );
    }
    if (edit.text === edit.replacement)
      throw new Error("Esta sugestão não altera o texto.");
    if (previous && edit.from < previous.to) {
      throw new Error(
        "Estas correções se sobrepõem. Remova uma das seleções antes de continuar.",
      );
    }
    if (isProtected(text, edit, ranges)) {
      throw new Error(
        "Números, códigos, identificadores e unidades técnicas não podem entrar no lote. Corrija esse trecho individualmente.",
      );
    }
    previous = edit;
  }
  return ordered;
}

export function createBatchPlan(
  snapshot: string,
  language: Language,
  edits: readonly BatchEdit[],
): BatchPlan {
  if (language !== "pt-BR" && language !== "en-US")
    throw new Error("Selecione um idioma válido para o lote.");
  return { snapshot, language, edits: validateBatch(snapshot, edits) };
}

/** Offsets refer to the original snapshot; CodeMirror applies the changes together. */
export function batchChanges(
  text: string,
  plan: BatchPlan,
): { from: number; to: number; insert: string }[] {
  if (text !== plan.snapshot)
    throw new Error(
      "O texto mudou depois da seleção. Revise e selecione novamente as correções do lote.",
    );
  return validateBatch(text, plan.edits).map((edit) => ({
    from: edit.from,
    to: edit.to,
    insert: edit.replacement,
  }));
}

/** One isolated history event, with selection mapped through the changes by CodeMirror. */
export function batchTransaction(
  state: EditorState,
  plan: BatchPlan,
): TransactionSpec {
  return {
    changes: batchChanges(state.doc.toString(), plan),
    userEvent: "input.batch",
    annotations: isolateHistory.of("full"),
  };
}

function floorIndex(positions: number[], position: number): number {
  let low = 0,
    high = positions.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (positions[middle]! <= position) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Short context per occurrence, without duplicating the full document in the UI. */
export function previewBatch(plan: BatchPlan): BatchPreviewItem[] {
  const edits = validateBatch(plan.snapshot, plan.edits),
    text = plan.snapshot;
  const starts = [0];
  for (const match of text.matchAll(/\r\n|\r|\n/g))
    starts.push(match.index + match[0].length);
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const lines = new Map<
    number,
    { start: number; end: number; boundaries: number[] }
  >();
  function lineAt(position: number) {
    const index = floorIndex(starts, position);
    let line = lines.get(index);
    if (!line) {
      const start = starts[index]!;
      let end = starts[index + 1] ?? text.length;
      while (end > start && /[\r\n]/.test(text[end - 1]!)) end--;
      const content = text.slice(start, end);
      const boundaries = [...segmenter.segment(content)].map(
        (part) => part.index,
      );
      if (!boundaries.length || boundaries.at(-1) !== content.length)
        boundaries.push(content.length);
      line = { start, end, boundaries };
      lines.set(index, line);
    }
    return { ...line, number: index + 1 };
  }
  return edits.map((edit) => {
    const beginning = lineAt(edit.from),
      ending = lineAt(edit.to);
    const first = floorIndex(beginning.boundaries, edit.from - beginning.start);
    const last = floorIndex(ending.boundaries, edit.to - ending.start);
    const prefixStart =
      beginning.start + beginning.boundaries[Math.max(0, first - 32)]!;
    const suffixEnd =
      ending.start +
      ending.boundaries[Math.min(ending.boundaries.length - 1, last + 32)]!;
    return {
      id: edit.id,
      line: beginning.number,
      column: first + 1,
      before: edit.text,
      after: edit.replacement,
      prefix: `${prefixStart > beginning.start ? "…" : ""}${text.slice(prefixStart, edit.from)}`,
      suffix: `${text.slice(edit.to, suffixEnd)}${suffixEnd < ending.end ? "…" : ""}`,
      category: edit.category,
    };
  });
}
