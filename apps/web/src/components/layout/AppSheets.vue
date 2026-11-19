<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DestinationPicker from '@/components/gps/DestinationPicker.vue'
import SavePositionForm from '@/components/gps/SavePositionForm.vue'
import ConfirmHost from '@/components/layout/ConfirmHost.vue'
import ToastHost from '@/components/layout/ToastHost.vue'
import SettingsPanel from '@/components/panels/SettingsPanel.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import { useUiStore, type SheetId } from '@/stores/ui'

/** Todas las hojas modales de la app, controladas por `ui.sheet`, más los avisos y el diálogo de confirmación. */
const { t } = useI18n()
const ui = useUiStore()

const bind = (id: SheetId) =>
  computed({
    get: () => ui.sheet === id,
    set: (open: boolean) => (open ? ui.open(id) : ui.close()),
  })

const settings = bind('settings')
const savePosition = bind('savePosition')
const destination = bind('destination')
</script>

<template>
  <BaseSheet v-model:open="settings" :title="t('settings.title')">
    <SettingsPanel v-if="settings" />
  </BaseSheet>
  <BaseSheet v-model:open="savePosition" :title="t('savePosition.title')">
    <!-- La clave fuerza un formulario nuevo para cada posición capturada. -->
    <SavePositionForm v-if="savePosition && ui.captured" :key="ui.captured.sample.t" :captured="ui.captured" @done="ui.close()" />
  </BaseSheet>
  <BaseSheet v-model:open="destination" :title="t('destination.title')">
    <DestinationPicker v-if="destination" @done="ui.close()" />
  </BaseSheet>
  <ConfirmHost />
  <ToastHost />
</template>
