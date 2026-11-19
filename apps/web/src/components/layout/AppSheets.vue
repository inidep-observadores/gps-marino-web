<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DestinationPicker from '@/components/gps/DestinationPicker.vue'
import ConfirmHost from '@/components/layout/ConfirmHost.vue'
import ToastHost from '@/components/layout/ToastHost.vue'
import PointForecastPanel from '@/components/forecast/PointForecastPanel.vue'
import LayersPanel from '@/components/map/LayersPanel.vue'
import MapSettingsPanel from '@/components/map/MapSettingsPanel.vue'
import SettingsPanel from '@/components/panels/SettingsPanel.vue'
import BaseSheet from '@/components/ui/BaseSheet.vue'
import ExportPanel from '@/components/waypoints/ExportPanel.vue'
import RestorePanel from '@/components/waypoints/RestorePanel.vue'
import WaypointForm from '@/components/waypoints/WaypointForm.vue'
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
const waypoint = bind('waypoint')
const destination = bind('destination')
const exportSheet = bind('export')
const restore = bind('restore')
const mapSettings = bind('mapSettings')
const layersSheet = bind('layers')
const forecastSheet = bind('pointForecast')

const waypointTitle = computed(() =>
  ui.editing?.kind === 'edit' ? t('waypointForm.editTitle') : t('savePosition.title'),
)
/** Clave que fuerza un formulario nuevo por cada ubicación o posición capturada. */
const waypointKey = computed(() =>
  ui.editing?.kind === 'edit' ? ui.editing.id : ui.editing ? `new-${ui.editing.input.recordedAt}-${ui.editing.input.lat}` : '',
)
</script>

<template>
  <BaseSheet v-model:open="settings" :title="t('settings.title')">
    <SettingsPanel v-if="settings" />
  </BaseSheet>
  <BaseSheet v-model:open="waypoint" :title="waypointTitle">
    <WaypointForm v-if="waypoint && ui.editing" :key="waypointKey" :target="ui.editing" @done="ui.close()" />
  </BaseSheet>
  <BaseSheet v-model:open="destination" :title="t('destination.title')">
    <DestinationPicker v-if="destination" @done="ui.close()" />
  </BaseSheet>
  <BaseSheet v-model:open="exportSheet" :title="t('export.title')">
    <ExportPanel v-if="exportSheet" :ids="ui.exportRequest.ids" :backup="ui.exportRequest.backup" @done="ui.close()" />
  </BaseSheet>
  <BaseSheet v-model:open="restore" :title="t('restore.title')">
    <RestorePanel
      v-if="restore && ui.pendingRestore"
      :file-name="ui.pendingRestore.fileName"
      :backup="ui.pendingRestore.backup"
      @done="ui.close()"
    />
  </BaseSheet>
  <BaseSheet v-model:open="mapSettings" :title="t('mapSettings.title')">
    <MapSettingsPanel v-if="mapSettings" />
  </BaseSheet>
  <BaseSheet v-model:open="layersSheet" :title="t('layers.title')">
    <LayersPanel v-if="layersSheet" />
  </BaseSheet>
  <BaseSheet v-model:open="forecastSheet" :title="t('pointForecast.title')">
    <!-- La clave recrea el panel (y su pedido) para cada punto. -->
    <PointForecastPanel v-if="forecastSheet && ui.forecastPoint" :key="`${ui.forecastPoint.lat},${ui.forecastPoint.lon}`" :lat="ui.forecastPoint.lat" :lon="ui.forecastPoint.lon" />
  </BaseSheet>
  <ConfirmHost />
  <ToastHost />
</template>
