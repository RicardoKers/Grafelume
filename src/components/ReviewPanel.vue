<script setup lang="ts">
import { computed } from "vue";
import {
  Check,
  ChevronRight,
  BookPlus,
  EyeOff,
  X,
  CircleCheck,
  ListChecks,
} from "@lucide/vue";
import type { Issue } from "../types";
import type { BatchEdit } from "../review/BatchCorrections";
const props = defineProps<{
  issues: Issue[];
  active?: string;
  suggestions: string[];
  loading: boolean;
  empty: boolean;
  checking: boolean;
  batchMode: boolean;
  batchEdits: BatchEdit[];
  batchBlocked: boolean;
}>();
const emit = defineEmits<{
  select: [issue: Issue];
  replace: [issue: Issue, suggestion: string];
  ignore: [issue: Issue];
  add: [word: string];
  close: [];
  toggleBatch: [];
  queue: [issue: Issue, suggestion: string];
  preview: [];
  clearBatch: [];
  removeBatch: [id: string];
}>();

const selected = computed(
  () => new Map(props.batchEdits.map((edit) => [edit.id, edit])),
);

function chooseSuggestion(issue: Issue, suggestion: string) {
  if (props.batchMode) emit("queue", issue, suggestion);
  else emit("replace", issue, suggestion);
}

function suggestionLabel(suggestion: string): string {
  if (!suggestion) return "Remover espaço";
  if (suggestion === " ") return "Substituir por um espaço";
  if (/^\s+$/.test(suggestion)) {
    const lineBreaks = suggestion.match(/\n/g)?.length ?? 0;
    if (lineBreaks) {
      return `Substituir por ${lineBreaks === 1 ? "uma quebra de linha" : `${lineBreaks} quebras de linha`}`;
    }
    return `Substituir por ${suggestion.length} espaços`;
  }
  return `Substituir por ${suggestion}`;
}

function suggestionText(suggestion: string): string {
  return suggestion.trim() ? suggestion : suggestionLabel(suggestion);
}
</script>
<template>
  <aside
    class="review-panel"
    :class="{ 'is-batch-mode': batchMode }"
    aria-label="Painel de revisão"
  >
    <header class="panel-header">
      <div>
        <h2>
          Revisão <span class="count-badge">{{ issues.length }}</span>
        </h2>
        <p>Um olhar a mais para seu texto.</p>
      </div>
      <button
        class="icon-button"
        aria-label="Ocultar painel de revisão"
        title="Ocultar painel"
        @click="emit('close')"
      >
        <X :size="18" />
      </button>
    </header>
    <div class="batch-toolbar">
      <button
        class="batch-mode-toggle"
        :class="{ active: batchMode }"
        :aria-label="batchMode ? 'Sair do lote' : 'Correções em lote'"
        :aria-pressed="batchMode"
        @click="emit('toggleBatch')"
      >
        <ListChecks :size="15" />{{
          batchMode ? "Sair do lote" : "Correções em lote"
        }}
      </button>
      <p v-if="batchMode">
        Escolha sugestões para o lote. O texto só muda após a prévia.
      </p>
    </div>
    <div v-if="!issues.length" class="review-empty">
      <div class="empty-check">
        <CircleCheck :size="30" :stroke-width="1.5" />
      </div>
      <h3>
        {{
          checking
            ? "Verificando seu texto…"
            : empty
              ? "Espaço para boas ideias"
              : "Tudo em ordem por aqui"
        }}
      </h3>
      <p>
        {{
          empty
            ? "Escreva no editor. As sugestões aparecem aqui, no seu ritmo."
            : checking
              ? "O corretor está trabalhando neste navegador."
              : "Nenhum problema encontrado nas verificações ativas."
        }}
      </p>
    </div>
    <div v-else class="issue-list">
      <article
        v-for="issue in issues.slice(0, 150)"
        :key="issue.id"
        class="issue-card"
        :class="{ 'is-active': active === issue.id }"
      >
        <button class="issue-heading" @click="emit('select', issue)">
          <span
            ><span class="issue-category" :class="issue.category">{{
              issue.category === "spelling" ? "ORTOGRAFIA" : "REVISÃO BÁSICA"
            }}</span
            ><strong>{{ issue.text.replace(/\n/g, "↵") }}</strong></span
          ><ChevronRight :size="16" />
        </button>
        <div v-if="active === issue.id" class="issue-detail">
          <p>{{ issue.message }}</p>
          <div class="suggestions">
            <span v-if="loading" class="muted">Buscando sugestões…</span
            ><button
              v-for="suggestion in suggestions"
              :key="suggestion"
              class="suggestion-chip"
              :class="{
                'is-queued':
                  batchMode &&
                  selected.get(issue.id)?.replacement === suggestion,
              }"
              :aria-label="
                batchMode
                  ? `Selecionar para o lote: ${suggestionLabel(suggestion)}`
                  : suggestionLabel(suggestion)
              "
              :aria-pressed="
                batchMode
                  ? selected.get(issue.id)?.replacement === suggestion
                  : undefined
              "
              :disabled="batchMode && (batchBlocked || loading)"
              @click="chooseSuggestion(issue, suggestion)"
            >
              <Check :size="13" />{{ suggestionText(suggestion) }}</button
            ><span v-if="!loading && !suggestions.length" class="muted"
              >Sem sugestão. Você pode editar no texto.</span
            >
          </div>
          <p v-if="batchMode && batchBlocked" class="batch-protected-note">
            Este trecho técnico não pode entrar no lote. Você pode editá-lo
            individualmente.
          </p>
          <div v-if="!batchMode" class="issue-actions">
            <button @click="emit('ignore', issue)">
              <EyeOff :size="14" />Ignorar</button
            ><button
              v-if="issue.category === 'spelling'"
              @click="emit('add', issue.text)"
            >
              <BookPlus :size="14" />Adicionar
            </button>
          </div>
        </div>
        <div
          v-if="batchMode && selected.has(issue.id)"
          class="batch-selected-correction"
        >
          <span
            ><Check :size="13" /><span
              >Para o lote:
              <strong>{{
                suggestionText(selected.get(issue.id)!.replacement)
              }}</strong></span
            ></span
          >
          <button
            class="icon-button"
            :aria-label="`Remover correção de ${issue.text}`"
            title="Remover do lote"
            @click="emit('removeBatch', issue.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </article>
      <p v-if="issues.length > 150" class="panel-note">
        Mostrando 150 de {{ issues.length }} ocorrências. As próximas aparecem à
        medida que você revisa.
      </p>
    </div>
    <div v-if="batchMode" class="batch-selection-summary">
      <span class="batch-selection-count" role="status"
        >{{ batchEdits.length }}
        {{
          batchEdits.length === 1
            ? "correção selecionada"
            : "correções selecionadas"
        }}</span
      >
      <button
        class="batch-preview-button"
        :disabled="!batchEdits.length"
        @click="emit('preview')"
      >
        Ver prévia ({{ batchEdits.length }})<ChevronRight :size="15" />
      </button>
      <button
        class="batch-clear-button"
        :disabled="!batchEdits.length"
        @click="emit('clearBatch')"
      >
        Limpar seleção
      </button>
    </div>
    <footer class="panel-footer">
      <span class="local-dot" />Processado no seu dispositivo
    </footer>
  </aside>
</template>
