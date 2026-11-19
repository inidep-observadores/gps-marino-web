<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Eye, EyeOff, FileUp, MessageSquareText, Trash2, Wind } from '@lucide/vue'
import type { BaseGroup, ImportedLayer } from '@gpsm/shared'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useFormat } from '@/composables/useFormat'
import { BASE_LAYER_GROUPS } from '@/layers/baseLayers'
import { LayerImportError, useLayersStore } from '@/stores/layers'
import { useWindStore } from '@/stores/wind'
import { useToastStore } from '@/stores/toast'

/**
 * Panel de capas (`layers_panel_sheet.dart`): capas base empaquetadas (encender/apagar por grupo y etiquetas de
 * áreas) y capas importadas (GeoJSON, GPX o ZIP): visibilidad, descripciones de puntos, elementos ocultos y borrar.
 */
const { t } = useI18n()
const f = useFormat()
const layers = useLayersStore()
const wind = useWindStore()
const windOn = computed({ get: () => wind.enabled, set: (v: boolean) => void wind.setEnabled(v) })
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

async function remove(l: ImportedLayer) {
  if (await confirm({ title: t('layers.deleteTitle'), message: t('layers.deleteMessage', { name: l.name }), confirmLabel: t('waypoints.delete'), tone: 'danger' }))
    await layers.remove(l.id)
}

const featureCount = (l: ImportedLayer) => layers.importedParsed.get(l.id)?.features.length ?? 0
</script>

<template>
  <div class="flex flex-col gap-7">
    <section class="flex flex-col gap-3">
      <h3 class="eyebrow">{{ t('layers.base') }}</h3>
      <div v-for="g in BASE_LAYER_GROUPS" :key="g.key" class="flex items-center gap-3">
        <span class="h-1.5 w-6 shrink-0 rounded-full" :class="{ 'opacity-40': !layers.baseVisible[g.key] }" :style="swatch(g)" aria-hidden="true"></span>
        <ToggleRow v-model="toggles[g.key]!.value" class="flex-1" :label="t(`layers.groups.${g.key}`)" />
      </div>
      <ToggleRow v-model="labels" :label="t('layers.showLabels')" :hint="t('layers.showLabelsHint')" />
      <p class="text-caption">{{ t('layers.baseOffline') }}</p>
    </section>

    <section class="flex flex-col gap-3">
      <h3 class="eyebrow flex items-center gap-1.5"><Wind class="size-3.5" aria-hidden="true" />{{ t('layers.weather') }}</h3>
      <ToggleRow v-model="windOn" :label="t('layers.wind')" :hint="t('layers.windHint')" />
      <p class="text-caption">{{ t('layers.windOffline') }}</p>
    </section>

    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="eyebrow">{{ t('layers.imported') }}</h3>
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
          <div class="flex items-center gap-2">
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm font-semibold" :class="{ 'text-ink-subtle': !l.visible }">{{ l.name }}</span>
              <span class="numeric text-xs text-ink-subtle">
                {{ l.format.toUpperCase() }} · {{ t('layers.elements', featureCount(l)) }} · {{ f.date(l.importedAt) }}
              </span>
            </span>
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
