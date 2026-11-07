<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from "vue";
const props = defineProps<{
  x: number;
  y: number;
  incorrect: boolean;
  suggestions: string[];
  loading: boolean;
}>();
const emit = defineEmits<{
  close: [];
  action: [action: string];
  replace: [text: string];
}>();
const menu = ref<HTMLDivElement>();
const position = ref({ left: `${props.x}px`, top: `${props.y}px` });
function outside(event: PointerEvent) {
  if (!menu.value?.contains(event.target as Node)) emit("close");
}
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape" || event.key === "Tab") {
    event.preventDefault();
    emit("close");
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = [
    ...menu.value!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  ];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
          buttons.length;
  buttons[next]?.focus();
}
onMounted(async () => {
  await nextTick();
  const box = menu.value!.getBoundingClientRect();
  position.value = {
    left: `${Math.max(8, Math.min(props.x, innerWidth - box.width - 8))}px`,
    top: `${Math.max(8, Math.min(props.y, innerHeight - box.height - 8))}px`,
  };
  menu.value?.querySelector("button")?.focus();
  document.addEventListener("pointerdown", outside);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
</script>
<template>
  <div
    ref="menu"
    class="correction-menu"
    role="menu"
    aria-label="Opções de correção"
    :style="position"
    @keydown="keyboard"
  >
    <template v-if="incorrect">
      <div class="menu-caption">
        {{ loading ? "Buscando sugestões…" : "Sugestões de correção" }}
      </div>
      <button
        v-for="suggestion in suggestions"
        :key="suggestion"
        role="menuitem"
        class="menu-suggestion"
        @click="emit('replace', suggestion)"
      >
        {{ suggestion }}
      </button>
      <div v-if="!loading && !suggestions.length" class="menu-caption">
        Nenhuma sugestão encontrada
      </div>
      <button role="menuitem" @click="emit('action', 'ignore')">
        Ignorar palavra nesta sessão
      </button>
      <button role="menuitem" @click="emit('action', 'add')">
        Adicionar ao dicionário
      </button>
      <hr />
    </template>
    <button role="menuitem" @click="emit('action', 'cut')">
      Recortar <kbd>Ctrl+X</kbd>
    </button>
    <button role="menuitem" @click="emit('action', 'copy')">
      Copiar <kbd>Ctrl+C</kbd>
    </button>
    <button role="menuitem" @click="emit('action', 'paste')">
      Colar <kbd>Ctrl+V</kbd>
    </button>
    <button role="menuitem" @click="emit('action', 'select')">
      Selecionar tudo <kbd>Ctrl+A</kbd>
    </button>
  </div>
</template>
