<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import {
  EditorState,
  StateEffect,
  StateField,
  Compartment,
  EditorSelection,
} from "@codemirror/state";
import {
  EditorView,
  Decoration,
  keymap,
  placeholder,
  type DecorationSet,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  undo,
  redo,
} from "@codemirror/commands";
import type { Issue } from "../types";
import type { Settings } from "../services/SettingsService";
import { batchTransaction, type BatchPlan } from "../review/BatchCorrections";
import { translationTransaction, type TranslationSelection } from '../translation/replacement';

const props = defineProps<{ issues: Issue[]; settings: Settings }>();
const emit = defineEmits<{
  change: [text: string];
  context: [
    data: { x: number; y: number; from: number; to: number; text: string },
  ];
}>();
const host = ref<HTMLDivElement>();
let view: EditorView;
const appearance = new Compartment();
const markIssues = StateEffect.define<Issue[]>();
const issueField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects)
      if (effect.is(markIssues)) {
        marks = Decoration.set(
          effect.value
            .filter((i) => i.to <= tr.newDoc.length && i.to > i.from)
            .sort((a, b) => a.from - b.from || a.to - b.to)
            .map((i) =>
              Decoration.mark({
                class: `issue-${i.category}`,
                attributes: { "data-issue": i.id },
              }).range(i.from, i.to),
            ),
          true,
        );
      }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
function theme() {
  const fonts = {
    sans: 'Inter, "Segoe UI", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: "Consolas, monospace",
  };
  return EditorView.theme({
    "&": { fontSize: `${props.settings.fontSize}px` },
    ".cm-content": {
      fontFamily: fonts[props.settings.fontFamily],
      lineHeight: String(props.settings.lineHeight),
      maxWidth: `${props.settings.maxWidth}px`,
    },
  });
}
onMounted(() => {
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        placeholder("Comece a escrever ou cole seu texto aqui…"),
        issueField,
        appearance.of(theme()),
        EditorView.contentAttributes.of({
          "aria-label": "Editor de texto",
          role: "textbox",
          "aria-multiline": "true",
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit("change", update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          contextmenu(event, editor) {
            const pos = editor.posAtCoords({
              x: event.clientX,
              y: event.clientY,
            });
            if (pos === null) return false;
            event.preventDefault();
            const word = editor.state.wordAt(pos);
            const selected = editor.state.selection.main;
            const range =
              !selected.empty && pos >= selected.from && pos <= selected.to
                ? selected
                : word;
            const from = range?.from ?? pos,
              to = range?.to ?? pos;
            editor.dispatch({ selection: { anchor: from, head: to } });
            emit("context", {
              x: event.clientX,
              y: event.clientY,
              from,
              to,
              text: editor.state.sliceDoc(from, to),
            });
            return true;
          },
          keydown(event, editor) {
            if (
              event.key !== "ContextMenu" &&
              !(event.shiftKey && event.key === "F10")
            )
              return false;
            event.preventDefault();
            const selected = editor.state.selection.main;
            const pos = selected.head;
            const range = selected.empty ? editor.state.wordAt(pos) : selected;
            const from = range?.from ?? pos,
              to = range?.to ?? pos;
            const coords = editor.coordsAtPos(pos);
            // A keyboard context menu must keep the user's selection, including
            // its direction, for copy/cut/paste rather than select one word.
            if (selected.empty)
              editor.dispatch({ selection: { anchor: from, head: to } });
            emit("context", {
              x: coords?.left ?? 100,
              y: coords?.bottom ?? 150,
              from,
              to,
              text: editor.state.sliceDoc(from, to),
            });
            return true;
          },
        }),
      ],
    }),
  });
});
watch(
  () => props.issues,
  (issues) => view?.dispatch({ effects: markIssues.of(issues) }),
);
watch(
  () => [
    props.settings.fontFamily,
    props.settings.fontSize,
    props.settings.maxWidth,
    props.settings.lineHeight,
  ],
  () => view?.dispatch({ effects: appearance.reconfigure(theme()) }),
);
onBeforeUnmount(() => view?.destroy());
function replace(from: number, to: number, insert: string) {
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + insert.length),
    userEvent: "input.replace",
  });
  view.focus();
}
defineExpose({
  replace,
  applyTranslation: (source: TranslationSelection, insert: string) => {
    const transaction = translationTransaction(view.state, source, insert);
    if (!transaction) return false;
    view.dispatch(transaction);
    return true;
  },
  applyBatch: (plan: BatchPlan) => {
    view.dispatch(batchTransaction(view.state, plan));
    return true;
  },
  setText: (text: string) => replace(0, view.state.doc.length, text),
  selectAll: () => {
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
    view.focus();
  },
  navigate: (from: number, to: number) => {
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
  },
  selection: () => ({
    from: view.state.selection.main.from,
    to: view.state.selection.main.to,
    text: view.state.sliceDoc(
      view.state.selection.main.from,
      view.state.selection.main.to,
    ),
  }),
  insert: (text: string) => {
    const s = view.state.selection.main;
    replace(s.from, s.to, text);
  },
  undo: () => {
    undo(view);
    view.focus();
  },
  redo: () => {
    redo(view);
    view.focus();
  },
  focus: () => view.focus(),
});
</script>

<template><div ref="host" class="text-editor" /></template>
