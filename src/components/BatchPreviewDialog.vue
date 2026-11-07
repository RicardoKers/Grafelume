<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Check, X } from "@lucide/vue";
import { previewBatch, type BatchPlan } from "../review/BatchCorrections";

const props = defineProps<{ plan: BatchPlan }>();
const emit = defineEmits<{ close: []; apply: [] }>();
const dialog = ref<HTMLDialogElement>();
const cancel = ref<HTMLButtonElement>();
const items = computed(() => previewBatch(props.plan));

function visibleText(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, "↵")
    .replace(/\t/g, "⇥")
    .replace(/ /g, "·");
}
function close() {
  dialog.value?.close();
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
  // Opening a preview never makes Enter apply changes before the user reviews it.
  cancel.value?.focus({ preventScroll: true });
  if (dialog.value) dialog.value.scrollTop = 0;
});
</script>

<template>
  <dialog
    ref="dialog"
    class="batch-preview-dialog"
    aria-labelledby="batch-preview-title"
    aria-describedby="batch-preview-description"
    @close="emit('close')"
    @click="backdrop"
  >
    <header class="batch-preview-header">
      <div>
        <span class="eyebrow">ANTES DE APLICAR</span>
        <h2 id="batch-preview-title">Prévia das correções</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Fechar prévia"
        title="Fechar prévia"
        @click="close"
      >
        <X :size="20" />
      </button>
    </header>
    <div class="batch-preview-intro">
      <p id="batch-preview-description">
        Confira
        {{
          items.length === 1
            ? "a correção que você escolheu"
            : `as ${items.length} correções que você escolheu`
        }}. Somente estes trechos serão alterados, e você poderá desfazer tudo
        em uma única ação.
      </p>
      <p class="batch-whitespace-legend">
        Nos trechos destacados: · espaço · ↵ quebra de linha · ⇥ tabulação.
      </p>
    </div>
    <div class="batch-preview-list" aria-label="Alterações selecionadas">
      <article
        v-for="(item, index) in items"
        :key="item.id"
        class="batch-preview-item"
      >
        <div class="batch-preview-item-heading">
          <h3>
            Correção {{ index + 1
            }}<span :class="item.category">{{
              item.category === "spelling" ? "Ortografia" : "Revisão básica"
            }}</span>
          </h3>
          <p>Linha {{ item.line }} · coluna {{ item.column }}</p>
        </div>
        <div class="batch-preview-before">
          <span class="batch-preview-label">Antes</span>
          <p>
            <span class="batch-preview-context">{{ item.prefix }}</span
            ><del>{{ visibleText(item.before) }}</del
            ><span class="batch-preview-context">{{ item.suffix }}</span>
          </p>
        </div>
        <div class="batch-preview-after">
          <span class="batch-preview-label">Depois</span>
          <p>
            <span class="batch-preview-context">{{ item.prefix }}</span
            ><ins v-if="item.after">{{ visibleText(item.after) }}</ins
            ><span v-else class="batch-preview-removal">(remover)</span
            ><span class="batch-preview-context">{{ item.suffix }}</span>
          </p>
        </div>
      </article>
    </div>
    <footer class="batch-preview-footer">
      <button ref="cancel" autofocus class="batch-back-button" @click="close">
        Voltar à seleção
      </button>
      <button
        class="batch-apply-button"
        :disabled="!items.length"
        @click="emit('apply')"
      >
        <Check :size="16" />Aplicar {{ items.length }}
        {{ items.length === 1 ? "correção" : "correções" }}
      </button>
    </footer>
  </dialog>
</template>
