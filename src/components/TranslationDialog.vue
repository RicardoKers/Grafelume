<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowRight, Copy, Download, Trash2, X } from "@lucide/vue";
import { useTranslation } from "../composables/useTranslation";
import { copyText } from "../services/ClipboardService";
import { downloadText } from "../services/FileService";
import type { Language } from "../types";

const props = defineProps<{
  sourceText: string;
  sourceLanguage: Language;
  selected: boolean;
  stale: boolean;
}>();
const emit = defineEmits<{
  close: [];
  apply: [text: string, targetLanguage: Language];
}>();
const dialog = ref<HTMLDialogElement>();
const languageSelect = ref<HTMLSelectElement>();
const sourceLang = ref<Language>(props.sourceLanguage);
const targetLanguage = computed<Language>(() =>
  sourceLang.value === "pt-BR" ? "en-US" : "pt-BR",
);
const languageName = (language: Language) =>
  language === "pt-BR" ? "Português (Brasil)" : "Inglês (EUA)";
const {
  result,
  phase,
  error,
  progress,
  available,
  downloadBytes,
  busy,
  start,
  cancel,
  removeModel,
} = useTranslation(() => props.sourceText, sourceLang);
const actionMessage = ref("");
const removing = ref(false);
const firstDownloadMB = computed(() =>
  Math.ceil((downloadBytes.value || 135_000_000) / 1_000_000),
);
const startLabel = computed(() => {
  if (busy.value) return "Cancelar tradução";
  if (phase.value === "error") return "Tentar novamente";
  return available.value ? "Traduzir" : "Baixar modelo e traduzir";
});
const phaseMessage = computed(() => {
  if (phase.value === "downloading") return "Baixando arquivos para uso offline…";
  if (phase.value === "loading") return "Preparando o modelo no dispositivo…";
  if (phase.value === "translating") {
    const { completed, segments } = progress.value;
    return segments
      ? `Traduzindo: ${completed} de ${segments} trechos.`
      : "Traduzindo no dispositivo…";
  }
  if (phase.value === "ready") return "Tradução concluída. Revise o resultado.";
  return "";
});
function bytesLabel(bytes: number): string {
  return `${(Math.max(0, bytes) / 1_000_000).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} MB`;
}
async function startTranslation() {
  if (busy.value) {
    cancel();
    return;
  }
  actionMessage.value = "";
  try {
    await start();
  } catch (failure) {
    actionMessage.value =
      failure instanceof Error
        ? failure.message
        : "Não foi possível iniciar a tradução. Tente novamente.";
  }
}
async function copyTranslation() {
  if (!result.value) return;
  try {
    await copyText(result.value);
    actionMessage.value = "Tradução copiada.";
  } catch (failure) {
    actionMessage.value =
      failure instanceof Error
        ? failure.message
        : "Não foi possível copiar a tradução.";
  }
}
function exportTranslation() {
  if (!result.value) return;
  downloadText(result.value, `grafelume-traducao-${targetLanguage.value}.txt`);
  actionMessage.value = "Arquivo de tradução preparado.";
}
async function removeDownloadedModel() {
  if (busy.value || removing.value) return;
  removing.value = true;
  actionMessage.value = "";
  try {
    await removeModel();
    actionMessage.value = "Modelo removido. Você poderá baixá-lo novamente.";
  } catch (failure) {
    actionMessage.value =
      failure instanceof Error
        ? failure.message
        : "Não foi possível remover o modelo baixado.";
  } finally {
    removing.value = false;
  }
}
function applyTranslation() {
  if (!result.value || busy.value || props.stale) return;
  emit("apply", result.value, targetLanguage.value);
}
function close() {
  dialog.value?.close();
}
function closed() {
  cancel();
  emit("close");
}
function backdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    close();
}
onMounted(() => {
  dialog.value?.showModal();
  languageSelect.value?.focus({ preventScroll: true });
  if (dialog.value) dialog.value.scrollTop = 0;
});
</script>

<template>
  <dialog
    ref="dialog"
    class="translation-dialog"
    aria-labelledby="translation-title"
    aria-describedby="translation-description"
    @close="closed"
    @cancel="cancel"
    @click="backdrop"
  >
    <header class="translation-header">
      <div>
        <span class="eyebrow">{{ selected ? "Trecho selecionado" : "Texto inteiro" }}</span>
        <h2 id="translation-title">Tradução local</h2>
      </div>
      <button
        type="button"
        class="icon-button"
        aria-label="Fechar tradução"
        title="Fechar tradução"
        @click="close"
      >
        <X :size="20" />
      </button>
    </header>

    <div class="translation-content">
      <p id="translation-description" class="translation-description">
        Os textos ficam no dispositivo. Depois de baixar o modelo, você pode
        traduzir sem conexão.
      </p>
      <div class="translation-languages">
        <div class="translation-language-field">
          <label for="translation-language">Idioma do original</label>
          <select
            id="translation-language"
            ref="languageSelect"
            v-model="sourceLang"
            :disabled="busy || removing"
          >
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en-US">Inglês (EUA)</option>
          </select>
        </div>
        <ArrowRight :size="18" class="translation-direction" aria-hidden="true" />
        <div class="translation-language-field translation-target">
          <span>Traduzir para</span>
          <strong>{{ languageName(targetLanguage) }}</strong>
        </div>
      </div>

      <div class="translation-operation">
        <div class="translation-model-info">
          <p v-if="available">Modelo disponível para uso offline.</p>
          <p v-else>Até {{ firstDownloadMB }} MB no primeiro uso deste idioma.</p>
          <p class="translation-local-note">Tradução automática local. Revise o resultado.</p>
        </div>
        <button
          type="button"
          class="translation-start-button"
          :class="{ 'is-cancel': busy }"
          :disabled="removing || (!busy && !sourceText.trim())"
          @click="startTranslation"
        >
          {{ startLabel }}
        </button>
      </div>

      <div v-if="phaseMessage || error" class="translation-status">
        <p v-if="phaseMessage" role="status" aria-live="polite">{{ phaseMessage }}</p>
        <template v-if="phase === 'downloading'">
          <progress
            class="translation-progress"
            :value="progress.total > 0 ? progress.loaded : undefined"
            :max="progress.total > 0 ? progress.total : undefined"
            aria-label="Download do modelo de tradução"
          />
          <p class="translation-download-count">
            {{ bytesLabel(progress.loaded) }}
            <template v-if="progress.total > 0"> de {{ bytesLabel(progress.total) }}</template>
          </p>
        </template>
        <progress
          v-else-if="phase === 'translating' && progress.segments > 0"
          class="translation-progress"
          :value="progress.completed"
          :max="progress.segments"
          aria-label="Progresso da tradução"
        />
        <p v-if="error" class="translation-error" role="alert">{{ error }}</p>
      </div>

      <p v-if="stale" class="translation-stale-note" role="status">
        O texto original mudou. Copie a tradução ou reabra esta janela para traduzir
        a versão atual.
      </p>

      <div class="translation-panes">
        <section class="translation-pane">
          <div class="translation-pane-heading">
            <label for="translation-source">Original</label>
            <span>{{ selected ? "Trecho selecionado" : "Texto inteiro" }}</span>
          </div>
          <textarea
            id="translation-source"
            class="translation-text"
            :value="sourceText"
            :lang="sourceLang"
            readonly
            spellcheck="false"
          />
        </section>
        <section class="translation-pane translation-result-pane">
          <div class="translation-pane-heading">
            <label for="translation-result">Tradução</label>
            <div class="translation-result-actions">
              <button
                type="button"
                class="icon-button"
                :disabled="!result"
                aria-label="Copiar tradução"
                title="Copiar tradução"
                @click="copyTranslation"
              >
                <Copy :size="16" />
              </button>
              <button
                type="button"
                class="icon-button"
                :disabled="!result"
                aria-label="Exportar tradução em TXT"
                title="Exportar tradução em TXT"
                @click="exportTranslation"
              >
                <Download :size="16" />
              </button>
            </div>
          </div>
          <textarea
            id="translation-result"
            class="translation-text"
            :value="result"
            :lang="targetLanguage"
            :aria-busy="busy"
            placeholder="A tradução aparecerá aqui."
            readonly
            spellcheck="false"
          />
        </section>
      </div>

      <div class="translation-model-actions">
        <button
          v-if="available && !busy"
          type="button"
          class="translation-remove-model"
          :disabled="removing"
          @click="removeDownloadedModel"
        >
          <Trash2 :size="14" aria-hidden="true" />
          {{ removing ? "Removendo modelo…" : "Remover modelo baixado" }}
        </button>
        <p v-if="actionMessage" class="translation-action-message" role="status">
          {{ actionMessage }}
        </p>
      </div>
    </div>

    <footer class="translation-footer">
      <button type="button" class="translation-close-button" @click="close">Fechar</button>
      <button
        type="button"
        class="translation-apply-button"
        :disabled="!result || busy || stale"
        @click="applyTranslation"
      >
        Usar tradução no editor
      </button>
    </footer>
  </dialog>
</template>
