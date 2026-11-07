import { describe, expect, it } from "vitest";
import {
  EditorSelection,
  EditorState,
  type StateCommand,
} from "@codemirror/state";
import { history, undo, redo, undoDepth } from "@codemirror/commands";
import {
  batchChanges,
  batchTransaction,
  createBatchPlan,
  isBatchProtected,
  previewBatch,
  validateBatch,
  type BatchEdit,
} from "../../src/review/BatchCorrections";
import type { Language } from "../../src/types";

function edit(
  text: string,
  source: string,
  replacement: string,
  start = 0,
): BatchEdit {
  const from = text.indexOf(source, start);
  if (from < 0) throw new Error(`Test source not found: ${source}`);
  return {
    id: `${from}:${source}`,
    from,
    to: from + source.length,
    text: source,
    replacement,
    category: "spelling",
  };
}

function apply(text: string, edits: BatchEdit[]): string {
  const plan = createBatchPlan(text, "pt-BR", edits);
  return EditorState.create({ doc: text })
    .update({ changes: batchChanges(text, plan) })
    .state.doc.toString();
}

describe("explicit batch corrections", () => {
  it("replaces only selected occurrences and preserves Unicode and all other bytes", () => {
    const text = "😀 ac\u0327a\u0303o progrma e progrma.";
    const second = edit(
      text,
      "progrma",
      "programa",
      text.indexOf("progrma") + 1,
    );
    expect(apply(text, [second])).toBe(
      "😀 ac\u0327a\u0303o progrma e programa.",
    );
    expect(apply(text, [edit(text, "ac\u0327a\u0303o", "ação")])).toBe(
      "😀 ação progrma e progrma.",
    );
  });

  it("sorts independent replacements, changes their lengths and supports explicit deletion", () => {
    const text = "Um progrma tem texto errda .";
    const first = edit(text, "progrma", "programa");
    const second = edit(text, "errda", "errada");
    const space = { ...edit(text, " .", "."), category: "review" as const };
    expect(apply(text, [space, second, first])).toBe(
      "Um programa tem texto errada.",
    );
    expect(
      apply("Olá , mundo", [
        { ...edit("Olá , mundo", " ", ""), category: "review" },
      ]),
    ).toBe("Olá, mundo");
  });

  it("allows adjacent changes while rejecting intersecting ranges and duplicate occurrences", () => {
    const text = "errdaerrda";
    const first = edit(text, "errda", "clara");
    const second = edit(text, "errda", "correta", 5);
    expect(apply(text, [second, first])).toBe("claracorreta");
    const overlapping = {
      ...first,
      id: "overlap",
      to: 7,
      text: text.slice(0, 7),
    };
    expect(() => validateBatch(text, [overlapping, second])).toThrow(
      "sobrepõem",
    );
    expect(() =>
      validateBatch(text, [first, { ...second, id: first.id }]),
    ).toThrow("mais de uma vez");
    expect(() =>
      validateBatch(text, [first, { ...first, id: "same-range" }]),
    ).toThrow("sobrepõem");
  });

  it("requires a nonempty selection and rejects invalid ranges or unchanged suggestions", () => {
    const text = "progrma";
    const correction = edit(text, text, "programa");
    expect(() => validateBatch(text, [])).toThrow("Selecione pelo menos uma");
    for (const range of [
      { from: -1, to: 3 },
      { from: 0.5, to: 3 },
      { from: 0, to: 99 },
      { from: 3, to: 3 },
      { from: 4, to: 2 },
      { from: NaN, to: 3 },
    ])
      expect(() => validateBatch(text, [{ ...correction, ...range }])).toThrow(
        "intervalo inválido",
      );
    expect(() =>
      validateBatch(text, [{ ...correction, replacement: text }]),
    ).toThrow("não altera");
    expect(() =>
      validateBatch(text, [{ ...correction, text: "errada" }]),
    ).toThrow("trecho mudou");
    expect(() =>
      createBatchPlan(text, "fr-FR" as Language, [correction]),
    ).toThrow("idioma válido");
  });

  it("refuses to split surrogate pairs or detach combining accents", () => {
    const emoji = "😀 progrma";
    expect(() =>
      validateBatch(emoji, [
        {
          id: "partial-emoji",
          from: 0,
          to: 1,
          text: emoji.slice(0, 1),
          replacement: "!",
          category: "review",
        },
      ]),
    ).toThrow("intervalo inválido");
    const accent = "ac\u0327a\u0303o";
    expect(() =>
      validateBatch(accent, [
        {
          id: "detached-accent",
          from: 1,
          to: 2,
          text: "c",
          replacement: "s",
          category: "spelling",
        },
      ]),
    ).toThrow("intervalo inválido");
  });

  it("copies proposals and rejects a stale whole-document snapshot before any changes", () => {
    const original = "Este progrma.";
    const correction = edit(original, "progrma", "programa");
    const proposals = [correction];
    const plan = createBatchPlan(original, "pt-BR", proposals);
    correction.replacement = "outro";
    proposals.splice(0);
    expect(plan.edits[0]!.replacement).toBe("programa");
    expect(plan.edits).toHaveLength(1);
    expect(() => batchChanges(`${original} Novo parágrafo.`, plan)).toThrow(
      "texto mudou",
    );
    expect(() => batchChanges("Este probema.", plan)).toThrow("texto mudou");
    expect(batchChanges(original, plan)).toEqual([
      { from: 5, to: 12, insert: "programa" },
    ]);
  });

  it("protects numbers, identifiers, addresses, paths, units and code even when technical spelling filters are disabled", () => {
    const samples: [string, string, string][] = [
      ["Visite https://example.com/progrma", "progrma", "programa"],
      ["Envie para progrma@example.com", "progrma", "programa"],
      ["IP 192.168.1.7", "168", "169"],
      ["Quantidade 123", "123", "124"],
      ["Código AB12", "AB12", "AB13"],
      ["A variável_nome é local", "variável", "variaveis"],
      ["Use camelCase", "camel", "camelo"],
      ["C:\\docs\\progrma.txt", "progrma", "programa"],
      ["src/progrma.ts", "progrma", "programa"],
      ["progrma.json", "progrma", "programa"],
      ["São 5 kg", "kg", "quilogramas"],
      ["A frequência usa MHz", "MHz", "hertz"],
      ["Marcação `progrma`", "progrma", "programa"],
      ["```\nprogrma\n```", "progrma", "programa"],
      ["Temperatura de 20°C", "C", "F"],
      ["Medida em µm", "µm", "mm"],
    ];
    for (const [text, source, replacement] of samples) {
      const correction = edit(text, source, replacement);
      expect(isBatchProtected(text, correction), text).toBe(true);
      expect(() => validateBatch(text, [correction]), text).toThrow(
        "não podem entrar no lote",
      );
    }
    const prose = "São 42  palavras com progrma.";
    expect(
      apply(prose, [
        edit(prose, "  ", " "),
        edit(prose, "progrma", "programa"),
      ]),
    ).toBe("São 42 palavras com programa.");
  });
});

describe("batch preview", () => {
  it("shows grapheme-based locations and nearby context without modifying the snapshot", () => {
    const text = "Cabeçalho\n😀 ac\u0327a\u0303o progrma.\nFinal";
    const plan = createBatchPlan(text, "pt-BR", [
      edit(text, "progrma", "programa"),
    ]);
    expect(previewBatch(plan)).toEqual([
      {
        id: plan.edits[0]!.id,
        line: 2,
        column: 8,
        before: "progrma",
        after: "programa",
        prefix: "😀 ac\u0327a\u0303o ",
        suffix: ".",
        category: "spelling",
      },
    ]);
    expect(plan.snapshot).toBe(text);
  });

  it("bounds context to complete graphemes and keeps CRLF offsets intact", () => {
    const text = `${"a\u0301".repeat(50)} progrma ${"😀".repeat(50)}\r\nOutra linha.`;
    const preview = previewBatch(
      createBatchPlan(text, "pt-BR", [edit(text, "progrma", "programa")]),
    )[0]!;
    expect(preview.prefix).toBe(`…${"a\u0301".repeat(31)} `);
    expect(preview.suffix).toBe(` ${"😀".repeat(31)}…`);
    expect(preview.column).toBe(52);
    const crlf = "Primeira\r\nprogrma\r\nFinal";
    expect(
      previewBatch(
        createBatchPlan(crlf, "pt-BR", [edit(crlf, "progrma", "programa")]),
      )[0],
    ).toMatchObject({ line: 2, column: 1, prefix: "", suffix: "" });
  });
});

describe("CodeMirror batch transaction", () => {
  it("is one undoable action, isolated from typing before and after, and maps selection", () => {
    const original = "Um progrma e outro progrma.";
    let state = EditorState.create({ extensions: [history()] });
    state = state.update({
      changes: { from: 0, insert: original },
      userEvent: "input.type",
    }).state;
    state = state.update({
      selection: EditorSelection.single(original.length, 3),
    }).state;
    const plan = createBatchPlan(original, "pt-BR", [
      edit(original, "progrma", "programa"),
      edit(original, "progrma", "programa", original.indexOf("progrma") + 1),
    ]);
    state = state.update(batchTransaction(state, plan)).state;
    expect(state.doc.toString()).toBe("Um programa e outro programa.");
    expect(state.selection.main.anchor).toBe(original.length + 2);
    expect(state.selection.main.head).toBe(3);
    expect(undoDepth(state)).toBe(2);
    state = state.update({
      changes: { from: state.doc.length, insert: "!" },
      userEvent: "input.type",
    }).state;
    expect(undoDepth(state)).toBe(3);
    const run = (command: StateCommand) =>
      expect(
        command({
          state,
          dispatch: (transaction) => (state = transaction.state),
        }),
      ).toBe(true);
    run(undo);
    expect(state.doc.toString()).toBe("Um programa e outro programa.");
    run(undo);
    expect(state.doc.toString()).toBe(original);
    expect(state.selection.main.anchor).toBe(original.length);
    expect(state.selection.main.head).toBe(3);
    run(redo);
    expect(state.doc.toString()).toBe("Um programa e outro programa.");
    run(redo);
    expect(state.doc.toString()).toBe("Um programa e outro programa.!");
  });
});
