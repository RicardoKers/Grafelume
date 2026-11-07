import { nextTick, ref, watch, type Ref } from "vue";
import type { Issue, Language } from "../types";
import {
  createBatchPlan,
  validateBatch,
  type BatchEdit,
  type BatchPlan,
} from "../review/BatchCorrections";

interface BatchActions {
  apply: (plan: BatchPlan) => boolean;
  notify: (message: string) => void;
  focusEditor: () => void;
}

/** Selections and preview snapshots live only in this open document's memory. */
export function useBatchCorrections(
  text: Ref<string>,
  language: () => Language,
  actions: BatchActions,
) {
  const mode = ref(false);
  const edits = ref<BatchEdit[]>([]);
  const plan = ref<BatchPlan>();
  let snapshot: string | undefined;
  let snapshotLanguage: Language | undefined;

  function clear() {
    edits.value = [];
    plan.value = undefined;
    snapshot = undefined;
    snapshotLanguage = undefined;
  }

  function invalidate(message: string) {
    const hadSelections = edits.value.length > 0 || !!plan.value;
    clear();
    if (hadSelections) actions.notify(message);
  }

  watch([text, language], () =>
    invalidate(
      "O texto ou o idioma mudou. Selecione novamente as correções para o lote.",
    ),
  );

  function remove(id: string) {
    edits.value = edits.value.filter((edit) => edit.id !== id);
    plan.value = undefined;
    if (!edits.value.length) clear();
  }

  function select(issue: Issue, replacement: string) {
    if (!mode.value) return;
    if (
      snapshot !== undefined &&
      (snapshot !== text.value || snapshotLanguage !== language())
    ) {
      invalidate(
        "O texto ou o idioma mudou. Selecione novamente as correções para o lote.",
      );
      return;
    }
    const existing = edits.value.find((edit) => edit.id === issue.id);
    if (existing?.replacement === replacement) {
      remove(issue.id);
      return;
    }
    const next: BatchEdit = {
      id: issue.id,
      from: issue.from,
      to: issue.to,
      text: issue.text,
      replacement,
      category: issue.category,
    };
    try {
      const validated = validateBatch(text.value, [
        ...edits.value.filter((edit) => edit.id !== issue.id),
        next,
      ]);
      edits.value = validated;
      snapshot = text.value;
      snapshotLanguage = language();
      plan.value = undefined;
    } catch (error) {
      actions.notify((error as Error).message);
    }
  }

  function preview() {
    if (!edits.value.length) return;
    if (snapshot !== text.value || snapshotLanguage !== language()) {
      invalidate(
        "O texto ou o idioma mudou. Selecione novamente as correções para o lote.",
      );
      return;
    }
    try {
      plan.value = createBatchPlan(text.value, language(), edits.value);
    } catch (error) {
      actions.notify((error as Error).message);
    }
  }

  async function apply() {
    const previewed = plan.value;
    if (!previewed) return;
    try {
      if (previewed.language !== language())
        throw new Error(
          "O idioma mudou. Selecione novamente as correções para o lote.",
        );
      if (!actions.apply(previewed))
        throw new Error("Não foi possível aplicar o lote. Tente novamente.");
      const count = previewed.edits.length;
      // Clear before the document watcher runs, so our own transaction does not
      // look like an unrelated edit that invalidated the user's preview.
      clear();
      await nextTick();
      actions.focusEditor();
      actions.notify(
        `${count === 1 ? "1 correção aplicada" : `${count} correções aplicadas`}. Use Desfazer para reverter o lote.`,
      );
    } catch (error) {
      clear();
      actions.notify((error as Error).message);
    }
  }

  return {
    mode,
    edits,
    plan,
    select,
    preview,
    apply,
    clear,
    remove,
    invalidate,
    closePreview: () => {
      plan.value = undefined;
    },
    toggle: () => {
      mode.value = !mode.value;
      clear();
    },
  };
}
