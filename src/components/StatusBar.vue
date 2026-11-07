<script setup lang="ts">
import { computed } from "vue";
import type { Language } from "../types";
const props = defineProps<{
  words: number;
  characters: number;
  language: Language;
  issues: number;
  state: "loading" | "ready" | "disabled" | "error";
  showCounts: boolean;
}>();
const status = computed(
  () =>
    ({
      loading: "Verificando…",
      ready: "Corretor ativo",
      disabled: "Corretor desativado",
      error: "Corretor indisponível",
    })[props.state],
);
</script>

<template>
  <footer class="status-bar">
    <div class="status-left">
      <template v-if="showCounts">
        <span
          >{{ words.toLocaleString("pt-BR") }}
          {{ words === 1 ? "palavra" : "palavras" }}</span
        >
        <span class="status-dot">·</span>
        <span>{{ characters.toLocaleString("pt-BR") }} caracteres</span>
        <span class="status-divider" />
      </template>
      <span>{{
        language === "pt-BR" ? "Português (Brasil)" : "English (US)"
      }}</span>
    </div>
    <div class="status-right">
      <span class="issue-status"
        >{{ issues }} {{ issues === 1 ? "ocorrência" : "ocorrências" }}</span
      >
      <span class="status-divider" />
      <span class="checker-state" :class="state"><span />{{ status }}</span>
    </div>
  </footer>
</template>
