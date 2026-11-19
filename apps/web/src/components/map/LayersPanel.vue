<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Download, Eye, EyeOff, FileUp, Grid3x3, Layers as LayersIcon, MessageSquareText, Pencil, Route as RouteIcon, Trash2, Wind, X } from '@lucide/vue'
import type { BaseGroup, GraticuleMode, ImportedLayer } from '@gpsm/shared'
import SegmentedControl, { type SegmentOption } from '@/components/ui/SegmentedControl.vue'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useFormat } from '@/composables/useFormat'
import { BASE_LAYER_GROUPS } from '@/layers/baseLayers'
import { LayerImportError, useLayersStore } from '@/stores/layers'
import { LAYER_NAME_MAX } from '@/logic/layerName'
import { useMapStore } from '@/stores/map'
import { useTracksStore } from '@/stores/tracks'
import { useWindStore, type WindStyle } from '@/stores/wind'
import { useToastStore } from '@/stores/toast'

/**
 * Panel de capas (`layers_panel_sheet.dart`): capas base empaquetadas (encender/apagar por grupo y etiquetas de
 * áreas) y capas importadas (GeoJSON, GPX o ZIP): visibilidad, descripciones de puntos, elementos ocultos y borrar.
 */
const { t } = useI18n()
const f = useFormat()
const layers = useLayersStore()
const wind = useWindStore()
const tracks = useTracksStore()
const mapStore = useMapStore()
const gridOn = computed({
  get: () => mapStore.settings.graticule.show,
  set: (v: boolean) => void mapStore.update({ graticule: { ...mapStore.settings.graticule, show: v } }),
})
const gridMode = computed({
  get: () => mapStore.settings.graticule.mode,
  set: (v: GraticuleMode) => void mapStore.update({ graticule: { ...mapStore.settings.graticule, mode: v } }),
})
const gridModeOptions = computed<SegmentOption<GraticuleMode>[]>(() => [
  { value: 'adaptive', label: t('layers.gridAdaptive') },
  { value: 'deg1', label: t('layers.gridDeg1') },
  { value: 'deg05', label: t('layers.gridDeg05') },
])
const windOn = computed({ get: () => wind.enabled, set: (v: boolean) => void wind.setEnabled(v) })
const windStyle = computed({ get: () => wind.windStyle, set: (v: WindStyle) => void wind.setStyle(v) })
const windStyleOptions = computed<SegmentOption<WindStyle>[]>(() => [
  { value: 'particles', label: t('layers.windStyleParticles') },
  { value: 'barbs', label: t('layers.windStyleBarbs') },
])
const toast = useToastStore()
const confirm = useConfirm()

/** Muestra de color de cada grupo (primer archivo). */
const swatch = (g: (typeof BASE_LAYER_GROUPS)[number]) => `background: var(${g.files[0]!.token})`

const baseToggle = (key: BaseGroup) =>
  computed({ get: () => layers.baseVisible[key], set: (v: boolean) => void layers.setBaseVisible(key, v) })
const toggles = Object.fromEntries(BASE_LAYER_GROUPS.map((g) => [g.key, baseToggle(g.key)]))
const labels = computed({ get: () => layers.showLabels, set: (v: boolean) => void layers.setShowLabels(v) })

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  try {
    let res = await layers.importFile(file)
    if (res.status === 'exists') {
      const ok = await confirm({
        title: t('layers.overwriteTitle'),
        message: t('layers.overwriteMessage', { name: res.name }),
        confirmLabel: t('layers.overwrite'),
      })
      if (!ok) return
      res = await layers.importFile(file, true)
    }
    toast.push(t('layers.importedOk', { name: res.name }), { tone: 'success' })
  } catch (err) {
    const code = err instanceof LayerImportError ? err.code : 'unreadable'
    toast.push(t(`layers.errors.${code}`), { tone: 'warning', timeoutMs: 7000 })
  } finally {
    busy.value = false
  }
}

/** Cambio de nombre en la propia fila: se toca el lápiz, se escribe y Enter guarda (Escape cancela). */
const renamingId = ref<string | null>(null)
const draft = ref('')
const renameError = ref<'empty' | 'exists' | null>(null)
async function startRename(l: ImportedLayer) {
  renamingId.value = l.id
  draft.value = l.name
  renameError.value = null
  await nextTick()
  const el = document.getElementById('layer-rename') as HTMLInputElement | null
  el?.focus()
  el?.select()
}
function cancelRename() {
  renamingId.value = null
  renameError.value = null
}
async function commitRename(l: ImportedLayer) {
  const r = await layers.rename(l.id, draft.value)
  if (r.ok) cancelRename()
  else renameError.value = r.error
}

async function remove(l: ImportedLayer) {
  if (await confirm({ title: t('layers.deleteTitle'), message: t('layers.deleteMessage', { name: l.name }), confirmLabel: t('waypoints.delete'), tone: 'danger' }))
    await layers.remove(l.id)
}

async function removeTrack(id: string, name: string) {
  if (await confirm({ title: t('tracks.deleteTitle'), message: t('tracks.deleteMessage', { name }), confirmLabel: t('waypoints.delete'), tone: 'danger' })) await tracks.remove(id)
}
async function exportTrack(track: (typeof tracks.list)[number]) {
  const r = await tracks.exportGpx(track)
  if (r !== 'cancelled') toast.push(t(r === 'shared' ? 'export.shared' : 'export.downloaded', { name: track.name }), { tone: 'success' })
}
const duration = (t0: number, t1: number | null) => {
  const m = Math.max(0, Math.round(((t1 ?? Date.now()) - t0) / 60_000))
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

const featureCount = (l: ImportedLayer) => layers.importedParsed.get(l.id)?.features.length ?? 0
</script>

<template>
  <div class="flex flex-col gap-4">
    <section class="panel-section">
      <h3 class="eyebrow flex items-center gap-1.5"><LayersIcon class="size-3.5" aria-hidden="true" />{{ t('layers.base') }}</h3>
      <div v-for="g in BASE_LAYER_GROUPS" :key="g.key" class="flex items-center gap-3">
        <span class="h-1.5 w-6 shrink-0 rounded-full" :class="{ 'opacity-40': !layers.baseVisible[g.key] }" :style="swatch(g)" aria-hidden="true"></span>
        <ToggleRow v-model="toggles[g.key]!.value" class="flex-1" :label="t(`layers.groups.${g.key}`)" />
      </div>
      <ToggleRow v-model="labels" :label="t('layers.showLabels')" :hint="t('layers.showLabelsHint')" />
      <p class="text-caption">{{ t('layers.baseOffline') }}</p>
    </section>

    <section class="panel-section">
      <h3 class="eyebrow flex items-center gap-1.5"><Grid3x3 class="size-3.5" aria-hidden="true" />{{ t('layers.grid') }}</h3>
      <ToggleRow v-model="gridOn" :label="t('layers.gridShow')" :hint="t('layers.gridHint')" />
      <!-- Resolución: solo con la cuadrícula visible. -->
      <template v-if="gridOn">
        <SegmentedControl v-model="gridMode" :options="gridModeOptions" :label="t('layers.gridResolution')" />
        <p class="text-caption">{{ t(gridMode === 'adaptive' ? 'layers.gridAdaptiveHint' : 'layers.gridFixedHint') }}</p>
      </template>
    </section>

    <section class="panel-section">
      <h3 class="eyebrow flex items-center gap-1.5"><Wind class="size-3.5" aria-hidden="true" />{{ t('layers.weather') }}</h3>
      <ToggleRow v-model="windOn" :label="t('layers.wind')" :hint="t('layers.windHint')" />
      <!-- Cómo dibujar el viento: solo con la capa encendida. -->
      <template v-if="wind.enabled">
        <SegmentedControl v-model="windStyle" :options="windStyleOptions" :label="t('layers.windStyle')" />
        <p v-if="wind.windStyle === 'barbs'" class="text-caption">{{ t('layers.windBarbsLegend') }}</p>
      </template>
      <p class="text-caption">{{ t('layers.windOffline') }}</p>
    </section>

    <section class="panel-section">
      <h3 class="eyebrow flex items-center gap-1.5"><RouteIcon class="size-3.5" aria-hidden="true" />{{ t('tracks.title') }}</h3>
      <p class="text-caption">{{ t('tracks.hint') }}</p>
      <p v-if="!tracks.list.length" class="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-secondary">{{ t('tracks.none') }}</p>
      <ul v-else class="list">
        <li v-for="tr in tracks.list" :key="tr.id" class="flex items-center gap-2 px-4 py-3">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-semibold" :class="{ 'text-ink-subtle': !tr.visible }">{{ tr.name }}</span>
            <span class="numeric text-xs text-ink-subtle">
              <template v-if="tracks.recording?.id === tr.id">● {{ t('tracks.recording') }} · </template>{{ f.distance(tr.distanceNm) }} {{ t('units.nm') }} · {{ duration(tr.startedAt, tr.endedAt) }} · {{ t('tracks.points', tr.pointCount) }}
            </span>
          </span>
          <button type="button" class="icon-btn" :aria-pressed="tr.visible" :aria-label="t(tr.visible ? 'layers.hideLayer' : 'layers.showLayer', { name: tr.name })" @click="tracks.setVisible(tr.id, !tr.visible)">
            <Eye v-if="tr.visible" class="size-5 text-accent" />
            <EyeOff v-else class="size-5" />
          </button>
          <button type="button" class="icon-btn" :disabled="tracks.recording?.id === tr.id" :aria-label="t('tracks.exportGpx', { name: tr.name })" :title="t('tracks.exportGpx', { name: tr.name })" @click="exportTrack(tr)"><Download class="size-5" /></button>
          <button type="button" class="icon-btn text-stop" :disabled="tracks.recording?.id === tr.id" :aria-label="t('layers.deleteLayer', { name: tr.name })" @click="removeTrack(tr.id, tr.name)"><Trash2 class="size-5" /></button>
        </li>
      </ul>
    </section>

    <section class="panel-section">
      <div class="flex items-center justify-between gap-3">
        <h3 class="eyebrow flex items-center gap-1.5"><FileUp class="size-3.5" aria-hidden="true" />{{ t('layers.imported') }}</h3>
        <button type="button" class="btn-secondary h-9" :disabled="busy" @click="fileInput?.click()">
          <FileUp class="size-4" aria-hidden="true" />{{ t('layers.import') }}
        </button>
        <!-- Sin `accept`: en Android filtra mal .gpx/.geojson y los deja grises. -->
        <input ref="fileInput" type="file" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFile" />
      </div>
      <p class="text-caption">{{ t('layers.importHint') }}</p>

      <p v-if="!layers.imported.length" class="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-secondary">
        {{ t('layers.noImported') }}
      </p>
      <ul v-else class="list">
        <li v-for="l in layers.imported" :key="l.id" class="flex flex-col gap-2 px-4 py-3">
          <form v-if="renamingId === l.id" class="flex flex-col gap-1.5" @submit.prevent="commitRename(l)">
            <div class="flex items-center gap-2">
              <input
                id="layer-rename"
                v-model="draft"
                class="input min-w-0 flex-1"
                :maxlength="LAYER_NAME_MAX"
                enterkeyhint="done"
                autocomplete="off"
                :aria-label="t('layers.renameLabel')"
                :aria-invalid="!!renameError"
                @input="renameError = null"
                @keydown.esc.stop.prevent="cancelRename"
              />
              <button type="submit" class="icon-btn text-accent" :aria-label="t('layers.saveName')" :title="t('layers.saveName')"><Check class="size-5" /></button>
              <button type="button" class="icon-btn" :aria-label="t('common.cancel')" :title="t('common.cancel')" @click="cancelRename"><X class="size-5" /></button>
            </div>
            <p v-if="renameError" class="text-xs text-stop">{{ t(`layers.rename${renameError === 'empty' ? 'Empty' : 'Exists'}`) }}</p>
          </form>
          <div v-else class="flex items-center gap-2">
            <!-- Tocar el nombre lo edita (el lápiz lo indica): así no se suma un cuarto botón y el nombre conserva su ancho -->
            <button type="button" class="flex min-w-0 flex-1 flex-col text-left" :aria-label="t('layers.rename', { name: l.name })" :title="t('layers.rename', { name: l.name })" @click="startRename(l)">
              <span class="flex items-center gap-1.5">
                <span class="truncate text-sm font-semibold" :class="{ 'text-ink-subtle': !l.visible }">{{ l.name }}</span>
                <Pencil class="size-3.5 shrink-0 text-ink-subtle" aria-hidden="true" />
              </span>
              <span class="numeric text-xs text-ink-subtle">
                {{ l.format.toUpperCase() }} · {{ t('layers.elements', featureCount(l)) }} · {{ f.date(l.importedAt) }}
              </span>
            </button>
            <button type="button" class="icon-btn" :aria-pressed="l.visible" :aria-label="t(l.visible ? 'layers.hideLayer' : 'layers.showLayer', { name: l.name })" @click="layers.toggleVisible(l.id)">
              <Eye v-if="l.visible" class="size-5 text-accent" />
              <EyeOff v-else class="size-5" />
            </button>
            <button
              type="button"
              class="icon-btn"
              :aria-pressed="l.showDescriptions"
              :aria-label="t(l.showDescriptions ? 'layers.hideDescriptions' : 'layers.showDescriptions')"
              :title="t(l.showDescriptions ? 'layers.hideDescriptions' : 'layers.showDescriptions')"
              @click="layers.toggleDescriptions(l.id)"
            >
              <MessageSquareText class="size-5" :class="{ 'text-accent': l.showDescriptions }" />
            </button>
            <button type="button" class="icon-btn text-stop" :aria-label="t('layers.deleteLayer', { name: l.name })" @click="remove(l)">
              <Trash2 class="size-5" />
            </button>
          </div>
          <div v-if="l.hiddenFeatures.length" class="flex items-center justify-between gap-2 text-xs text-ink-muted">
            <span>{{ t('layers.hiddenCount', l.hiddenFeatures.length) }}</span>
            <button type="button" class="font-semibold text-accent" @click="layers.setHidden(l.id, l.hiddenFeatures, false)">{{ t('layers.unhideAll') }}</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
