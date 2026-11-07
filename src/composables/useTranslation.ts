import { ref, computed, watch, onBeforeUnmount, type Ref } from 'vue';
import type { Language } from '../types';
import { directionFor } from '../translation/assets';
import { inspectModel, prepareModel, removeModel as removeCachedModel } from '../translation/ModelStore';
import type { TranslationPhase, TranslationProgress, TranslationResponse } from '../translation/protocol';

export function useTranslation(source: () => string, language: Ref<Language>) {
  const result = ref(''), error = ref(''), available = ref(false), downloadBytes = ref(0);
  const phase = ref<TranslationPhase>('idle');
  const progress = ref<TranslationProgress>({ loaded: 0, total: 0, completed: 0, segments: 0 });
  const busy = computed(() => ['downloading', 'loading', 'translating'].includes(phase.value));
  let generation = 0, worker: Worker | undefined, controller: AbortController | undefined;
  function cancel() {
    generation++;
    controller?.abort(); controller = undefined;
    worker?.terminate(); worker = undefined;
    if (busy.value) phase.value = 'idle';
  }
  async function inspect() {
    const version = generation, direction = directionFor(language.value);
    try {
      const status = await inspectModel(direction);
      if (version === generation) { available.value = status.available; downloadBytes.value = status.downloadBytes; }
    } catch (cause) {
      if (version === generation) { error.value = cause instanceof Error ? cause.message : 'Armazenamento local indisponível.'; phase.value = 'error'; }
    }
  }
  watch(language, () => { cancel(); result.value = ''; error.value = ''; phase.value = 'idle'; available.value = false; void inspect(); }, { immediate: true });
  async function start() {
    if (busy.value || !source().trim()) return;
    cancel();
    const version = generation, text = source(), sourceLanguage = language.value;
    error.value = ''; result.value = '';
    progress.value = { loaded: 0, total: 0, completed: 0, segments: 0 };
    controller = new AbortController();
    phase.value = 'downloading';
    try {
      await prepareModel(directionFor(sourceLanguage), controller.signal, value => {
        if (version === generation) progress.value = { ...progress.value, ...value };
      });
      if (version !== generation) return;
      available.value = true; downloadBytes.value = 0; phase.value = 'loading';
      worker = new Worker(new URL('../translation/TranslationWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<TranslationResponse>) => {
        if (version !== generation) return;
        if (data.type === 'progress') {
          phase.value = 'translating'; progress.value = { ...progress.value, completed: data.completed, segments: data.segments };
        } else {
          if (data.type === 'result') { result.value = data.text; phase.value = 'ready'; }
          else { error.value = data.message; phase.value = 'error'; }
          worker?.terminate(); worker = undefined;
        }
      };
      worker.onerror = event => {
        event.preventDefault();
        if (version !== generation) return;
        error.value = 'Não foi possível iniciar a tradução local neste navegador. Tente novamente ou use um navegador atualizado.';
        phase.value = 'error'; worker?.terminate(); worker = undefined;
      };
      worker.postMessage({ text, language: sourceLanguage, base: import.meta.env.BASE_URL });
    } catch (cause) {
      if (version !== generation) return;
      error.value = cause instanceof DOMException && cause.name === 'QuotaExceededError'
        ? 'Não há espaço suficiente no navegador. Libere espaço ou remova um modelo baixado e tente novamente.'
        : cause instanceof TypeError ? 'Não foi possível baixar o modelo. Verifique a conexão e tente novamente.'
        : cause instanceof Error ? cause.message : 'Não foi possível preparar a tradução local.';
      phase.value = 'error';
      await inspect();
    }
  }
  async function removeModel() {
    if (busy.value) return;
    try { await removeCachedModel(directionFor(language.value)); await inspect(); }
    catch { error.value = 'Não foi possível remover o modelo deste navegador.'; throw new Error(error.value); }
  }
  onBeforeUnmount(cancel);
  return { result, phase, error, progress, available, downloadBytes, busy, start, cancel, removeModel };
}
