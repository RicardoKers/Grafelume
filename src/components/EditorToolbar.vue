<script setup lang="ts">
import {
  FilePlus2,
  Copy,
  ClipboardPaste,
  ScanText,
  Undo2,
  Redo2,
  SpellCheck,
  PanelRight,
  Download,
  Upload,
} from "@lucide/vue";
defineProps<{ spelling: boolean; reviewVisible: boolean; hasText: boolean }>();
const emit = defineEmits<{ action: [name: string] }>();
const operations = [
  { name: "new", label: "Novo texto", icon: FilePlus2 },
  { name: "copy", label: "Copiar texto", icon: Copy },
  { name: "paste", label: "Colar texto", icon: ClipboardPaste },
  { name: "select", label: "Selecionar tudo", icon: ScanText },
  { name: "undo", label: "Desfazer", icon: Undo2 },
  { name: "redo", label: "Refazer", icon: Redo2 },
];
</script>
<template>
  <div class="editor-toolbar" role="toolbar" aria-label="Ferramentas do editor">
    <div class="tool-group">
      <button
        v-for="op in operations"
        :key="op.name"
        class="icon-button"
        :class="{ 'mobile-secondary': op.name === 'select' }"
        :title="op.label"
        :aria-label="op.label"
        @click="emit('action', op.name)"
      >
        <component :is="op.icon" :size="18" :stroke-width="1.7" />
      </button>
    </div>
    <span class="toolbar-divider" />
    <button
      class="tool-toggle"
      :class="{ active: spelling }"
      title="Ativar/desativar correção ortográfica"
      aria-label="Correção ortográfica"
      :aria-pressed="spelling"
      @click="emit('action', 'spelling')"
    >
      <SpellCheck :size="19" /><span>Corretor</span><span class="toggle-dot" />
    </button>
    <div class="toolbar-spacer" />
    <div class="tool-group">
      <button
        class="icon-button"
        title="Importar TXT"
        aria-label="Importar TXT"
        @click="emit('action', 'import')"
      >
        <Upload :size="18" :stroke-width="1.7" /></button
      ><button
        class="export-button"
        title="Exportar TXT"
        aria-label="Exportar TXT"
        :disabled="!hasText"
        @click="emit('action', 'export')"
      >
        <Download :size="17" /><span>Exportar .txt</span>
      </button>
    </div>
    <span class="toolbar-divider" />
    <button
      class="icon-button"
      :class="{ 'selected-tool': reviewVisible }"
      title="Exibir/ocultar painel de revisão"
      aria-label="Painel de revisão"
      :aria-pressed="reviewVisible"
      @click="emit('action', 'panel')"
    >
      <PanelRight :size="18" />
    </button>
  </div>
</template>
