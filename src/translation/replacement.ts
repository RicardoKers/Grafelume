import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';

export interface TranslationSelection { snapshot: string; from: number; to: number }
export function translationTransaction(state: EditorState, source: TranslationSelection, insert: string): TransactionSpec | null {
  if (state.doc.toString() !== source.snapshot || !insert.trim() || !Number.isInteger(source.from) || !Number.isInteger(source.to) || source.from < 0 || source.to <= source.from || source.to > state.doc.length) return null;
  const normalized = state.toText(insert);
  return {
    changes: { from: source.from, to: source.to, insert: normalized },
    selection: EditorSelection.cursor(source.from + normalized.length),
    annotations: isolateHistory.of('full'),
    userEvent: 'input.translate',
  };
}
