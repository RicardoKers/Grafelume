<script setup lang="ts">
import { ref, onMounted } from "vue";
import { X, Trash2, Plus } from "@lucide/vue";
import type { Settings } from "../services/SettingsService";
const props = defineProps<{ settings: Settings; personal: string[] }>();
const emit = defineEmits<{
  close: [];
  add: [word: string];
  remove: [word: string];
}>();
const dialog = ref<HTMLDialogElement>(),
  word = ref(""),
  tab = ref("appearance");
onMounted(() => dialog.value?.showModal());
function add() {
  if (word.value.trim()) {
    emit("add", word.value.trim());
    word.value = "";
  }
}
</script>
<template>
  <dialog
    ref="dialog"
    class="settings-dialog"
    aria-labelledby="settings-title"
    @close="emit('close')"
    @click="
      (event) => {
        if (event.target === dialog) dialog?.close();
      }
    "
  >
    <header>
      <div>
        <span class="eyebrow">DO SEU JEITO</span>
        <h2 id="settings-title">Configurações</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Fechar configurações"
        @click="dialog?.close()"
      >
        <X :size="20" />
      </button>
    </header>
    <nav class="settings-tabs" aria-label="Categorias de configuração">
      <button
        v-for="[id, label] in [
          ['appearance', 'Aparência'],
          ['correction', 'Correção'],
          ['dictionary', 'Dicionário'],
        ]"
        :key="id"
        :class="{ active: tab === id }"
        @click="tab = id"
      >
        {{ label }}
      </button>
    </nav>
    <section v-if="tab === 'appearance'" class="settings-fields">
      <label
        >Tema<select v-model="props.settings.theme">
          <option value="system">Seguir o sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select></label
      >
      <label
        >Fonte<select v-model="props.settings.fontFamily">
          <option value="sans">Sem serifa</option>
          <option value="serif">Serifada</option>
          <option value="mono">Monoespaçada</option>
        </select></label
      >
      <label
        >Tamanho da fonte <span>{{ props.settings.fontSize }} px</span
        ><input
          v-model.number="props.settings.fontSize"
          type="range"
          min="14"
          max="28"
      /></label>
      <label
        >Largura de leitura <span>{{ props.settings.maxWidth }} px</span
        ><input
          v-model.number="props.settings.maxWidth"
          type="range"
          min="480"
          max="1100"
          step="20"
      /></label>
      <label
        >Espaçamento entre linhas<select
          v-model.number="props.settings.lineHeight"
        >
          <option :value="1.5">Compacto · 1,5</option>
          <option :value="1.8">Confortável · 1,8</option>
          <option :value="2">Amplo · 2,0</option>
        </select></label
      >
      <label class="check-label"
        ><input v-model="props.settings.showCounts" type="checkbox" />Mostrar
        contagem de palavras e caracteres</label
      >
      <label class="check-label"
        ><input v-model="props.settings.showReview" type="checkbox" />Mostrar
        painel de revisão</label
      >
      <label class="check-label"
        ><input
          v-model="props.settings.confirmClear"
          type="checkbox"
        />Confirmar antes de limpar o texto</label
      >
      <label class="check-label"
        ><input
          v-model="props.settings.restorePreferences"
          type="checkbox"
        />Restaurar preferências ao abrir</label
      >
    </section>
    <section v-if="tab === 'correction'" class="settings-fields">
      <label
        >Idioma<select v-model="props.settings.language">
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en-US">English (US)</option>
        </select></label
      >
      <label class="check-label"
        ><input v-model="props.settings.spelling" type="checkbox" />Verificar
        ortografia</label
      >
      <label class="check-label"
        ><input v-model="props.settings.review" type="checkbox" />Revisar
        espaços, repetições e pontuação</label
      >
      <label class="check-label"
        ><input
          v-model="props.settings.ignoreTechnical"
          type="checkbox"
        />Reconhecer URLs, códigos e termos técnicos</label
      >
      <label
        >Sugestões por palavra<select
          v-model.number="props.settings.suggestions"
        >
          <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
        </select></label
      >
      <p class="muted">
        O idioma é escolhido por você. Não há alternância automática nem análise
        de concordância gramatical.
      </p>
    </section>
    <section v-if="tab === 'dictionary'" class="dictionary-settings">
      <p class="muted">
        Suas palavras em
        {{ props.settings.language === "pt-BR" ? "português" : "inglês" }}.
        Salvas apenas neste navegador.
      </p>
      <form class="add-word" @submit.prevent="add">
        <input
          v-model="word"
          aria-label="Nova palavra"
          placeholder="Adicionar uma palavra"
          maxlength="100"
          required
        /><button
          class="primary-button"
          aria-label="Adicionar palavra"
          type="submit"
        >
          <Plus :size="17" />
        </button>
      </form>
      <ul class="personal-list">
        <li v-for="item in personal" :key="item">
          <span>{{ item }}</span
          ><button
            class="icon-button"
            :aria-label="`Remover ${item}`"
            @click="emit('remove', item)"
          >
            <Trash2 :size="16" />
          </button>
        </li>
      </ul>
      <p v-if="!personal.length" class="dictionary-empty">
        Seu dicionário pessoal está pronto para novas palavras.
      </p>
    </section>
    <footer>
      Preferências salvas no navegador. Seu texto não é armazenado.
    </footer>
  </dialog>
</template>
