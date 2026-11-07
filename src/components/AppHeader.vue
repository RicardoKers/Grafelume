<script setup lang="ts">
import { Settings2, Sun, Moon, ChevronDown } from "@lucide/vue";
import type { Settings } from "../services/SettingsService";

defineProps<{ settings: Settings; dark: boolean }>();
const emit = defineEmits<{ settings: []; focus: []; toggleTheme: [] }>();
const logoUrl = `${import.meta.env.BASE_URL}icons/icon.svg`;
</script>

<template>
  <header class="app-header">
    <a
      class="brand"
      href="./"
      aria-label="Grafelume, início"
      @click.prevent="emit('focus')"
    >
      <img :src="logoUrl" width="32" height="32" alt="" />
      <span
        >Grafelume<span class="brand-dot">.</span
        ><small>Escreva com clareza.</small></span
      >
    </a>
    <div class="header-actions">
      <div class="language-picker">
        <span class="language-short">{{
          settings.language === "pt-BR" ? "PT" : "EN"
        }}</span>
        <select v-model="settings.language" aria-label="Idioma do texto">
          <option value="pt-BR">Português (Brasil)</option>
          <option value="en-US">English (US)</option>
        </select>
        <ChevronDown :size="14" />
      </div>
      <span class="header-divider" />
      <button
        class="icon-button"
        aria-label="Alternar tema"
        :title="dark ? 'Usar tema claro' : 'Usar tema escuro'"
        @click="emit('toggleTheme')"
      >
        <Sun v-if="dark" :size="20" :stroke-width="1.6" /><Moon
          v-else
          :size="20"
          :stroke-width="1.6"
        />
      </button>
      <button
        class="icon-button"
        title="Configurações"
        aria-label="Configurações"
        @click="emit('settings')"
      >
        <Settings2 :size="20" :stroke-width="1.6" />
      </button>
    </div>
  </header>
</template>
