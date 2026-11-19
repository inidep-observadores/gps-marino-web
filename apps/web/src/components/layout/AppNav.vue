<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useNavItems } from '@/composables/useNavItems'
import { VIEW_HASH, useUiStore } from '@/stores/ui'

/**
 * Navegación principal. `variant="tabs"`: pestañas del encabezado (pantallas medianas y grandes).
 * `variant="bar"`: barra inferior fija para el celular, al alcance del pulgar.
 */
defineProps<{ variant: 'tabs' | 'bar' }>()

const { t } = useI18n()
const ui = useUiStore()
const items = useNavItems()
</script>

<template>
  <nav v-if="variant === 'tabs'" :aria-label="t('nav.label')" class="nav-tabs">
    <a
      v-for="item in items"
      :key="item.id"
      :href="VIEW_HASH[item.id]"
      class="nav-tab"
      :aria-current="ui.view === item.id ? 'page' : undefined"
      @click.prevent="ui.go(item.id)"
    >
      <component :is="item.icon" class="size-4" aria-hidden="true" />
      {{ item.label }}
    </a>
  </nav>

  <nav v-else :aria-label="t('nav.label')" class="bottom-bar">
    <a
      v-for="item in items"
      :key="item.id"
      :href="VIEW_HASH[item.id]"
      class="bottom-bar-item"
      :aria-current="ui.view === item.id ? 'page' : undefined"
      @click.prevent="ui.go(item.id)"
    >
      <span class="bottom-bar-icon">
        <component :is="item.icon" class="size-5" aria-hidden="true" />
      </span>
      {{ item.label }}
    </a>
  </nav>
</template>
