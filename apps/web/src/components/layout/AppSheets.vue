<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConfirmHost from '@/components/layout/ConfirmHost.vue'
import SettingsPanel from '@/components/panels/SettingsPanel.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { useUiStore, type SheetId } from '@/stores/ui'

/** Todas las hojas modales de la app, controladas por `ui.sheet`. */
const { t } = useI18n()
const ui = useUiStore()

const bind = (id: SheetId) =>
  computed({
    get: () => ui.sheet === id,
    set: (open: boolean) => (open ? ui.open(id) : ui.close()),
  })

const settings = bind('settings')
</script>

<template>
  <BaseSheet v-model:open="settings" :title="t('settings.title')">
    <SettingsPanel v-if="settings" />
  </BaseSheet>
  <ConfirmHost />
</template>
