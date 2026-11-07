<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import {
  ShieldCheck,
  Download,
  ArrowUpRight,
  WifiOff,
  RefreshCw,
  X,
  Check,
} from "@lucide/vue";
import AppHeader from "./components/AppHeader.vue";
import StatusBar from "./components/StatusBar.vue";
import TextEditor from "./components/TextEditor.vue";
import EditorToolbar from "./components/EditorToolbar.vue";
import ReviewPanel from "./components/ReviewPanel.vue";
import CorrectionMenu from "./components/CorrectionMenu.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import BatchPreviewDialog from "./components/BatchPreviewDialog.vue";
import { useBatchCorrections } from "./composables/useBatchCorrections";
import { isBatchProtected } from "./review/BatchCorrections";
import {
  loadSettings,
  saveSettings,
  loadPersonal,
  savePersonal,
} from "./services/SettingsService";
import { copyText, readText } from "./services/ClipboardService";
import { downloadText, readTextFile } from "./services/FileService";
import { useProofreader } from "./composables/useProofreader";
import { registerPwa, prepareOffline, dictionaryOffline } from "./pwa";
import type { Issue } from "./types";

const settings = reactive(loadSettings()),
  text = ref("");
const editor = ref<InstanceType<typeof TextEditor>>(),
  fileInput = ref<HTMLInputElement>();
const personal = ref(loadPersonal(settings.language)),
  ignored = ref<string[]>([]);
const { issues, state, error, retry, suggestions, ignoreReview } =
  useProofreader(text, settings, personal, ignored);
const settingsOpen = ref(false),
  toast = ref(""),
  offline = ref(!navigator.onLine),
  offlineReady = ref(false),
  preparing = ref(false);
const active = ref<Issue>(),
  activeSuggestions = ref<string[]>([]),
  suggestionsLoading = ref(false);
const {
  mode: batchMode,
  edits: batchEdits,
  plan: batchPlan,
  select: selectBatch,
  preview: previewBatch,
  apply: applyBatch,
  clear: clearBatch,
  remove: removeBatch,
  invalidate: invalidateBatch,
  closePreview: closeBatchPreview,
  toggle: toggleBatch,
} = useBatchCorrections(text, () => settings.language, {
  apply: (plan) => editor.value?.applyBatch(plan) ?? false,
  notify,
  focusEditor: () => editor.value?.focus(),
});
const batchBlocked = computed(
  () => !!active.value && isBatchProtected(text.value, active.value),
);
const menu = ref<{
  x: number;
  y: number;
  from: number;
  to: number;
  text: string;
  issue?: Issue;
  suggestions: string[];
  loading: boolean;
}>();
const updateAvailable = ref<() => Promise<void>>(),
  installPrompt = ref<any>();
let toastTimer: ReturnType<typeof setTimeout>,
  suggestionVersion = 0,
  menuVersion = 0;
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)"),
  systemDark = ref(systemTheme.matches);
const dark = computed(
  () =>
    settings.theme === "dark" ||
    (settings.theme === "system" && systemDark.value),
);
const words = computed(
  () =>
    [
      ...new Intl.Segmenter(settings.language, { granularity: "word" }).segment(
        text.value,
      ),
    ].filter((s) => s.isWordLike).length,
);
const characters = computed(() => [...text.value].length);
function notify(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 5000);
}
watch(
  settings,
  (value) => {
    if (!saveSettings(value))
      notify("Não foi possível salvar as preferências neste navegador.");
  },
  { deep: true },
);
watch(
  dark,
  (value) => {
    document.documentElement.dataset.theme = value ? "dark" : "light";
  },
  { immediate: true },
);
watch(
  () => settings.language,
  () => {
    personal.value = loadPersonal(settings.language);
    ignored.value = [];
    active.value = undefined;
    menu.value = undefined;
    suggestionsLoading.value = false;
    suggestionVersion++;
    void refreshOffline();
  },
);
watch(text, () => {
  menu.value = undefined;
  active.value = undefined;
  suggestionVersion++;
});
watch(
  [
    () => settings.spelling,
    () => settings.review,
    () => settings.ignoreTechnical,
    personal,
    ignored,
  ],
  () =>
    invalidateBatch(
      "As opções da revisão mudaram. Selecione novamente as correções para o lote.",
    ),
  { deep: true },
);
watch(state, () => {
  if (state.value === "ready") void refreshOffline();
});
function onSystemTheme(event: MediaQueryListEvent) {
  systemDark.value = event.matches;
}
function network() {
  offline.value = !navigator.onLine;
  void refreshOffline();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (text.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
function beforeInstall(event: Event) {
  event.preventDefault();
  installPrompt.value = event;
}
onMounted(() => {
  systemTheme.addEventListener("change", onSystemTheme);
  window.addEventListener("online", network);
  window.addEventListener("offline", network);
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("beforeinstallprompt", beforeInstall);
  registerPwa((update) => (updateAvailable.value = update));
  void refreshOffline();
});
onBeforeUnmount(() => {
  clearTimeout(toastTimer);
  systemTheme.removeEventListener("change", onSystemTheme);
  window.removeEventListener("online", network);
  window.removeEventListener("offline", network);
  window.removeEventListener("beforeunload", beforeUnload);
  window.removeEventListener("beforeinstallprompt", beforeInstall);
});
async function refreshOffline() {
  const language = settings.language;
  const available = await dictionaryOffline(language);
  if (language === settings.language) offlineReady.value = available;
}
function confirmReplace() {
  return (
    !text.value ||
    !settings.confirmClear ||
    window.confirm(
      "Seu texto não é salvo. Deseja substituir o conteúdo atual? Copie ou exporte para guardar uma cópia.",
    )
  );
}
async function toolbar(action: string) {
  try {
    switch (action) {
      case "new":
        if (confirmReplace()) editor.value?.setText("");
        break;
      case "copy":
        await copyText(text.value);
        notify("Texto copiado.");
        break;
      case "paste": {
        const selection = editor.value?.selection(),
          snapshot = text.value;
        const clipboard = await readText();
        if (snapshot !== text.value) {
          notify(
            "O texto mudou enquanto a área de transferência era aberta. Cole novamente no ponto desejado.",
          );
          break;
        }
        if (selection)
          editor.value?.replace(selection.from, selection.to, clipboard);
        break;
      }
      case "select":
        editor.value?.selectAll();
        break;
      case "undo":
        editor.value?.undo();
        break;
      case "redo":
        editor.value?.redo();
        break;
      case "spelling":
        settings.spelling = !settings.spelling;
        break;
      case "panel":
        settings.showReview = !settings.showReview;
        break;
      case "import":
        fileInput.value?.click();
        break;
      case "export":
        downloadText(text.value);
        notify("Texto exportado em UTF-8.");
        break;
    }
  } catch (e) {
    notify((e as Error).message);
  }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  try {
    const content = await readTextFile(file);
    if (confirmReplace()) {
      editor.value?.setText(content);
      notify(`Arquivo ${file.name} aberto.`);
    }
  } catch (e) {
    notify((e as Error).message);
  } finally {
    input.value = "";
  }
}
function addWord(word: string) {
  const normalized = word.trim().normalize("NFC");
  if (
    normalized.length > 100 ||
    !/^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u.test(normalized)
  ) {
    notify(
      "Adicione uma única palavra de até 100 caracteres, usando letras, hífens ou apóstrofos.",
    );
    return;
  }
  const next = [...new Set([...personal.value, normalized])].sort((a, b) =>
    a.localeCompare(b, settings.language),
  );
  if (!savePersonal(settings.language, next)) {
    notify("Não foi possível salvar o dicionário pessoal.");
    return;
  }
  personal.value = next;
  notify(`“${normalized}” adicionada ao dicionário.`);
}
function removeWord(word: string) {
  const next = personal.value.filter((w) => w !== word);
  if (savePersonal(settings.language, next)) personal.value = next;
  else notify("Não foi possível salvar o dicionário pessoal.");
}
function ignore(issue: Issue) {
  invalidateBatch(
    "A revisão mudou. Selecione novamente as correções para o lote.",
  );
  if (issue.category === "spelling")
    ignored.value = [...ignored.value, issue.text];
  else ignoreReview(issue);
  active.value = undefined;
}
function apply(
  issue: Pick<Issue, "from" | "to" | "text">,
  replacement: string,
) {
  if (text.value.slice(issue.from, issue.to) !== issue.text) {
    notify("O trecho mudou. Selecione a ocorrência novamente.");
    return;
  }
  editor.value?.replace(issue.from, issue.to, replacement);
  menu.value = undefined;
  active.value = undefined;
}
function queueCorrection(issue: Issue, replacement: string) {
  const current = issues.value.find((item) => item.id === issue.id);
  const available =
    issue.category === "spelling" && active.value?.id === issue.id
      ? activeSuggestions.value
      : issue.suggestions;
  if (!current || !available.includes(replacement)) {
    notify("Esta sugestão mudou. Selecione a ocorrência novamente.");
    return;
  }
  selectBatch(current, replacement);
}
async function selectIssue(issue: Issue) {
  const version = ++suggestionVersion;
  active.value = issue;
  activeSuggestions.value = issue.suggestions;
  editor.value?.navigate(issue.from, issue.to);
  if (issue.category !== "spelling") {
    suggestionsLoading.value = false;
    return;
  }
  suggestionsLoading.value = true;
  try {
    const items = await suggestions(issue.text);
    if (version === suggestionVersion) activeSuggestions.value = items;
  } catch (e) {
    notify((e as Error).message);
  } finally {
    if (version === suggestionVersion) suggestionsLoading.value = false;
  }
}
async function openContext(data: {
  x: number;
  y: number;
  from: number;
  to: number;
  text: string;
}) {
  const version = ++menuVersion;
  const issue = issues.value.find(
    (i) => i.from <= data.from && i.to >= data.to && data.to > data.from,
  );
  // Use the full token for hyphenated words, which can span CodeMirror word boundaries.
  const target = issue
    ? { ...data, from: issue.from, to: issue.to, text: issue.text }
    : data;
  const current = {
    ...target,
    issue,
    suggestions: issue?.suggestions ?? [],
    loading: issue?.category === "spelling",
  };
  menu.value = current;
  if (current.loading) {
    try {
      const items = await suggestions(target.text);
      if (version === menuVersion && menu.value) menu.value.suggestions = items;
    } catch (e) {
      if (version === menuVersion && menu.value) notify((e as Error).message);
    } finally {
      if (version === menuVersion && menu.value) menu.value.loading = false;
    }
  }
}
function closeMenu() {
  menu.value = undefined;
  editor.value?.focus();
}
async function menuAction(action: string) {
  const target = menu.value;
  if (!target) return;
  try {
    if (action === "ignore" && target.issue) ignore(target.issue);
    else if (action === "add") addWord(target.text);
    else if (action === "copy" || action === "cut") {
      await copyText(target.text);
      if (action === "cut") apply(target, "");
    } else if (action === "paste") {
      const clip = await readText();
      apply(target, clip);
    } else if (action === "select") editor.value?.selectAll();
  } catch (e) {
    notify((e as Error).message);
  }
  closeMenu();
}
async function downloadOffline() {
  preparing.value = true;
  try {
    await prepareOffline();
    await refreshOffline();
    notify("Português e inglês prontos para usar sem conexão.");
  } catch (e) {
    notify((e as Error).message);
  } finally {
    preparing.value = false;
  }
}
async function install() {
  if (installPrompt.value) {
    await installPrompt.value.prompt();
    installPrompt.value = undefined;
  } else
    notify(
      "Para instalar, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.",
    );
}
async function updateApp() {
  if (
    text.value &&
    !confirm(
      "A atualização recarregará o aplicativo. Seu texto não é salvo. Copie ou exporte antes de continuar. Deseja atualizar agora?",
    )
  )
    return;
  await updateAvailable.value?.();
}
const example =
  "Este progrma permite verificar a ortografia dos documento.\n\nUma boa ideia merece um texto claro. Escreva, revise e compartilhe.";
</script>

<template>
  <div class="app-shell">
    <AppHeader
      :settings="settings"
      :dark="dark"
      @settings="settingsOpen = true"
      @focus="editor?.focus()"
      @toggle-theme="settings.theme = dark ? 'light' : 'dark'"
    />
    <main class="workspace">
      <h1 class="visually-hidden">Editor de texto</h1>
      <div v-if="updateAvailable" class="notice-banner">
        <RefreshCw :size="17" /><span>Uma nova versão está disponível.</span
        ><button @click="updateApp">Atualizar</button>
      </div>
      <div v-if="error" class="notice-banner error-banner" role="alert">
        <WifiOff :size="17" /><span>{{ error }}</span
        ><button @click="retry">Tentar novamente</button>
      </div>
      <section class="editor-card" aria-label="Documento">
        <EditorToolbar
          :spelling="settings.spelling"
          :review-visible="settings.showReview"
          :has-text="!!text"
          @action="toolbar"
        />
        <div class="editor-body" :class="{ 'with-panel': settings.showReview }">
          <div class="document-area">
            <div class="document-heading">
              <span><span class="document-dot" />Texto sem título</span
              ><span>TEXTO SIMPLES</span>
            </div>
            <TextEditor
              ref="editor"
              :settings="settings"
              :issues="issues"
              @change="(value) => (text = value)"
              @context="openContext"
            />
            <div v-if="!text" class="editor-inspiration">
              <span>Uma página em branco. Muitas possibilidades.</span
              ><button @click="editor?.setText(example)">
                Experimentar um exemplo <ArrowUpRight :size="14" />
              </button>
            </div>
            <div class="document-bottom">
              <span
                >Seu texto fica só aqui. Copie ou exporte para guardar.</span
              >
            </div>
          </div>
          <ReviewPanel
            v-if="settings.showReview"
            :issues="issues"
            :active="active?.id"
            :suggestions="activeSuggestions"
            :loading="suggestionsLoading"
            :empty="!text"
            :checking="state === 'loading' && !!text"
            :batch-mode="batchMode"
            :batch-edits="batchEdits"
            :batch-blocked="batchBlocked"
            @select="selectIssue"
            @replace="apply"
            @ignore="ignore"
            @add="addWord"
            @close="settings.showReview = false"
            @toggle-batch="toggleBatch"
            @queue="queueCorrection"
            @preview="previewBatch"
            @clear-batch="clearBatch"
            @remove-batch="removeBatch"
          />
        </div>
        <StatusBar
          :words="words"
          :characters="characters"
          :language="settings.language"
          :issues="issues.length"
          :state="state"
          :show-counts="settings.showCounts"
        />
      </section>
      <footer class="workspace-footer">
        <span
          ><ShieldCheck :size="15" />Sem contas. Sem nuvem. Seu texto é
          privado.</span
        >
        <div>
          <span class="offline-status"
            ><span v-if="offline"><WifiOff :size="13" />Sem conexão · </span
            >{{
              offlineReady
                ? "Idioma disponível offline"
                : "Idioma ainda não disponível offline"
            }}</span
          ><button :disabled="preparing" @click="downloadOffline">
            <Check v-if="offlineReady" :size="14" /><Download
              v-else
              :size="14"
            />{{ preparing ? "Preparando…" : "Preparar offline" }}</button
          ><button @click="install">
            Instalar aplicativo <ArrowUpRight :size="13" />
          </button>
        </div>
      </footer>
    </main>
    <div v-if="toast" class="toast" role="status">
      <span>{{ toast }}</span
      ><button aria-label="Fechar mensagem" @click="toast = ''">
        <X :size="16" />
      </button>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".txt,text/plain"
      class="visually-hidden"
      aria-label="Arquivo TXT"
      @change="importFile"
    />
    <SettingsDialog
      v-if="settingsOpen"
      :settings="settings"
      :personal="personal"
      @close="settingsOpen = false"
      @add="addWord"
      @remove="removeWord"
    />
    <BatchPreviewDialog
      v-if="batchPlan"
      :plan="batchPlan"
      @close="closeBatchPreview"
      @apply="applyBatch"
    />
    <CorrectionMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :incorrect="!!menu.issue"
      :has-selection="!!menu.text"
      :suggestions="menu.suggestions"
      :loading="menu.loading"
      @close="closeMenu"
      @replace="
        (value) => {
          if (menu) apply(menu, value);
        }
      "
      @action="menuAction"
    />
  </div>
</template>
