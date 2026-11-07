import { describe, expect, it } from "vitest";
import {
  EditorSelection,
  EditorState,
  type StateCommand,
} from "@codemirror/state";
import { history, redo, undo, undoDepth } from "@codemirror/commands";
import {
  translationTransaction,
  type TranslationSelection,
} from "../../src/translation/replacement";

describe("translation replacement transaction", () => {
  it("replaces the whole snapshot and preserves the returned translation exactly", () => {
    const original = "Olá, mundo!\nOutra linha.";
    const state = EditorState.create({ doc: original });
    const translation = "  Hello, world!\nAnother line.  ";
    const transaction = translationTransaction(
      state,
      { snapshot: original, from: 0, to: original.length },
      translation,
    );
    expect(transaction).not.toBeNull();
    const result = state.update(transaction!).state;
    expect(result.doc.toString()).toBe(translation);
    expect(result.selection.main.anchor).toBe(translation.length);
    expect(result.selection.main.head).toBe(translation.length);
    expect(state.doc.toString()).toBe(original);
  });

  it("uses CodeMirror's normalized text length for CRLF replacement and its cursor", () => {
    const original = "Olá, mundo.";
    const state = EditorState.create({ doc: original });
    const translation = "Hello, world.\r\nAnother line.\r\n";
    const normalized = state.toText(translation);
    const transaction = translationTransaction(
      state,
      { snapshot: original, from: 0, to: original.length },
      translation,
    );
    expect(transaction).not.toBeNull();
    const result = state.update(transaction!).state;
    expect(result.doc.toString()).toBe(normalized.toString());
    expect(result.selection.main.anchor).toBe(normalized.length);
    expect(result.selection.main.head).toBe(normalized.length);
  });

  it("replaces only a selection using UTF-16 positions and keeps surrounding Unicode", () => {
    const original = "🌱 A ac\u0327a\u0303o começou. 😀 fim.";
    const selected = "ac\u0327a\u0303o";
    const from = original.indexOf(selected);
    const to = from + selected.length;
    const source = Object.freeze({ snapshot: original, from, to });
    const translation = "😀 action";
    const state = EditorState.create({
      doc: original,
      selection: EditorSelection.single(to, from),
    });
    const transaction = translationTransaction(state, source, translation);
    expect(transaction).not.toBeNull();
    const result = state.update(transaction!).state;
    expect(result.doc.toString()).toBe(
      original.slice(0, from) + translation + original.slice(to),
    );
    expect(result.selection.main.anchor).toBe(from + translation.length);
    expect(result.selection.main.head).toBe(from + translation.length);
    expect(source).toEqual({ snapshot: original, from, to });
    expect(state.doc.toString()).toBe(original);
    expect(state.selection.main.anchor).toBe(to);
    expect(state.selection.main.head).toBe(from);
  });

  it("rejects a stale snapshot even when the selected substring is unchanged", () => {
    const snapshot = "Olá, mundo.";
    const current = `${snapshot} Outra frase.`;
    const state = EditorState.create({
      doc: current,
      selection: EditorSelection.single(3, 0),
    });
    const source = Object.freeze({ snapshot, from: 0, to: 3 });
    expect(translationTransaction(state, source, "Hello")).toBeNull();
    expect(state.doc.toString()).toBe(current);
    expect(state.selection.main.anchor).toBe(3);
    expect(state.selection.main.head).toBe(0);
    expect(source).toEqual({ snapshot, from: 0, to: 3 });
  });

  it("rejects invalid ranges without changing the snapshot or selection", () => {
    const snapshot = "Olá 😀 mundo.";
    const state = EditorState.create({
      doc: snapshot,
      selection: EditorSelection.single(4, 1),
    });
    const ranges = [
      { from: -1, to: 3 },
      { from: 0, to: -1 },
      { from: 3, to: 2 },
      { from: 3, to: 3 },
      { from: snapshot.length, to: snapshot.length },
      { from: 0, to: snapshot.length + 1 },
      { from: snapshot.length + 1, to: snapshot.length + 2 },
      { from: 0.5, to: 3 },
      { from: 0, to: 3.5 },
      { from: NaN, to: 3 },
      { from: 0, to: NaN },
      { from: Infinity, to: 3 },
      { from: 0, to: Infinity },
    ];
    for (const range of ranges) {
      const source = Object.freeze({ snapshot, ...range });
      expect(translationTransaction(state, source, "Hello")).toBeNull();
      expect(source).toEqual({ snapshot, ...range });
    }
    expect(state.doc.toString()).toBe(snapshot);
    expect(state.selection.main.anchor).toBe(4);
    expect(state.selection.main.head).toBe(1);
    expect(
      translationTransaction(EditorState.create(), { snapshot: "", from: 0, to: 0 }, "Hello"),
    ).toBeNull();
  });

  it.each(["", " ", "\t\r\n", "\u00a0\u2003"])(
    "rejects a blank translation %j without changing the editor",
    (translation) => {
      const snapshot = "Olá.";
      const state = EditorState.create({
        doc: snapshot,
        selection: EditorSelection.single(4, 0),
      });
      const source: TranslationSelection = Object.freeze({ snapshot, from: 0, to: 4 });
      expect(translationTransaction(state, source, translation)).toBeNull();
      expect(state.doc.toString()).toBe(snapshot);
      expect(state.selection.main.anchor).toBe(4);
      expect(state.selection.main.head).toBe(0);
    },
  );

  it("isolates translation from typing before and after through undo and redo", () => {
    const initial = "😀 Olá";
    let state = EditorState.create({
      doc: initial,
      selection: EditorSelection.cursor(initial.length),
      extensions: [history()],
    });
    state = state.update({
      changes: { from: state.doc.length, insert: " mundo" },
      selection: EditorSelection.cursor(state.doc.length + " mundo".length),
      userEvent: "input.type",
    }).state;
    const snapshot = state.doc.toString();
    const from = snapshot.indexOf("Olá");
    const to = from + "Olá".length;
    state = state.update({ selection: EditorSelection.single(to, from) }).state;
    const beforeTranslationSelection = state.selection;
    const transaction = translationTransaction(state, { snapshot, from, to }, "Hello");
    expect(transaction).not.toBeNull();
    state = state.update(transaction!).state;
    const translated = state.doc.toString();
    const translatedSelection = state.selection;
    expect(translated).toBe("😀 Hello mundo");
    expect(undoDepth(state)).toBe(2);

    state = state.update({
      changes: { from: state.selection.main.head, insert: "!" },
      selection: EditorSelection.cursor(state.selection.main.head + 1),
      userEvent: "input.type",
    }).state;
    const afterTyping = state.doc.toString();
    const afterTypingSelection = state.selection;
    expect(afterTyping).toBe("😀 Hello! mundo");
    expect(undoDepth(state)).toBe(3);

    const run = (command: StateCommand) => {
      expect(command({ state, dispatch: (update) => { state = update.state; } })).toBe(true);
    };
    run(undo);
    expect(state.doc.toString()).toBe(translated);
    expect(state.selection.toJSON()).toEqual(translatedSelection.toJSON());
    run(undo);
    expect(state.doc.toString()).toBe(snapshot);
    expect(state.selection.toJSON()).toEqual(beforeTranslationSelection.toJSON());
    run(undo);
    expect(state.doc.toString()).toBe(initial);
    expect(state.selection.main.anchor).toBe(initial.length);
    expect(state.selection.main.head).toBe(initial.length);

    run(redo);
    expect(state.doc.toString()).toBe(snapshot);
    run(redo);
    expect(state.doc.toString()).toBe(translated);
    expect(state.selection.main.from).toBeGreaterThanOrEqual(0);
    expect(state.selection.main.to).toBeLessThanOrEqual(state.doc.length);
    run(redo);
    expect(state.doc.toString()).toBe(afterTyping);
    expect(state.selection.toJSON()).toEqual(afterTypingSelection.toJSON());
  });
});
