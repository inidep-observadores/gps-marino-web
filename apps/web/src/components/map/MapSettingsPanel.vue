<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Anchor, CircleDot, Layers, Map as MapIcon, MoveUpRight, Mountain, Satellite } from '@lucide/vue'
import OfflineMapsSection from './OfflineMapsSection.vue'
import RouteSettings from '@/components/panels/RouteSettings.vue'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { useMapStore } from '@/stores/map'
import type { MapType } from './mapStyles'

/** "Configuración del mapa" de Flutter: tipo de mapa, buque, anillos de distancia, línea COG y rutas. */
const { t } = useI18n()
const map = useMapStore()
const s = computed(() => map.settings)

const TYPES = computed(() => [
  { id: 'standard' as MapType, icon: MapIcon, label: t('mapSettings.typeStandard') },
  { id: 'satellite' as MapType, icon: Satellite, label: t('mapSettings.typeSatellite') },
  { id: 'hybrid' as MapType, icon: Layers, label: t('mapSettings.typeHybrid') },
  { id: 'terrain' as MapType, icon: Mountain, label: t('mapSettings.typeTerrain') },
])

const toggle = (key: 'showVessel' | 'seamarks') =>
  computed({ get: () => s.value[key], set: (v: boolean) => void map.update({ [key]: v }) })
const showVessel = toggle('showVessel')
const seamarks = toggle('seamarks')
const ringsShow = computed({ get: () => s.value.rings.show, set: (v: boolean) => void map.update({ rings: { ...s.value.rings, show: v } }) })
const cogShow = computed({ get: () => s.value.cog.show, set: (v: boolean) => void map.update({ cog: { ...s.value.cog, show: v } }) })

function num(e: Event, min: number, max: number, integer = false): number | null {
  const v = Number((e.target as HTMLInputElement).value.replace(',', '.'))
  if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) return null
  return v
}
const setCount = (e: Event) => {
  const v = num(e, 1, 20, true)
  if (v != null) void map.update({ rings: { ...s.value.rings, count: v } })
}
const setSpacing = (e: Event) => {
  const v = num(e, 0.05, 50)
  if (v != null) void map.update({ rings: { ...s.value.rings, spacingNm: v } })
}
const setMinutes = (e: Event) => {
  const v = num(e, 1, 600, true)
  if (v != null) void map.update({ cog: { ...s.value.cog, minutes: v } })
}
</script>

<template>
  <div class="flex flex-col gap-7">
    <section class="flex flex-col gap-3">
      <h3 class="eyebrow">{{ t('mapSettings.mapType') }}</h3>
      <div class="grid grid-cols-2 gap-2" role="radiogroup" :aria-label="t('mapSettings.mapType')">
        <button
          v-for="opt in TYPES"
          :key="opt.id"
          type="button"
          role="radio"
          :aria-checked="s.mapType === opt.id"
          class="flex h-14 items-center gap-2.5 rounded-2xl border px-3.5 text-sm font-medium transition"
          :class="s.mapType === opt.id ? 'border-accent bg-accent/8 text-ink ring-2 ring-accent/20' : 'border-line text-ink-muted hover:border-line-strong'"
          @click="map.update({ mapType: opt.id })"
        >
          <component :is="opt.icon" class="size-5 shrink-0" :class="s.mapType === opt.id ? 'text-accent' : ''" aria-hidden="true" />
          {{ opt.label }}
        </button>
      </div>
      <p class="text-caption">{{ t('mapSettings.offlineHint') }}</p>
      <ToggleRow v-model="seamarks" :label="t('mapSettings.seamarks')" :hint="t('mapSettings.seamarksHint')" />
    </section>

    <section class="flex flex-col gap-4">
      <h3 class="eyebrow flex items-center gap-1.5"><Anchor class="size-3.5" aria-hidden="true" />{{ t('mapSettings.vessel') }}</h3>
      <ToggleRow v-model="showVessel" :label="t('mapSettings.showVessel')" />

      <ToggleRow v-model="ringsShow" :label="t('mapSettings.rings')" />
      <div class="grid grid-cols-2 gap-3">
        <label class="field">
          <span class="field-label flex items-center gap-1"><CircleDot class="size-3.5" aria-hidden="true" />{{ t('mapSettings.ringsCount') }}</span>
          <input class="input numeric" type="number" inputmode="numeric" min="1" max="20" step="1" :value="s.rings.count" :disabled="!s.rings.show" @change="setCount" />
        </label>
        <label class="field">
          <span class="field-label">{{ t('mapSettings.ringsSpacing') }}</span>
          <input class="input numeric" type="number" inputmode="decimal" min="0.05" max="50" step="0.05" :value="s.rings.spacingNm" :disabled="!s.rings.show" @change="setSpacing" />
        </label>
      </div>

      <ToggleRow v-model="cogShow" :label="t('mapSettings.cog')" :hint="t('mapSettings.cogHint')" />
      <label class="field">
        <span class="field-label flex items-center gap-1"><MoveUpRight class="size-3.5" aria-hidden="true" />{{ t('mapSettings.cogMinutes') }}</span>
        <input class="input numeric w-32" type="number" inputmode="numeric" min="1" max="600" step="1" :value="s.cog.minutes" :disabled="!s.cog.show" @change="setMinutes" />
      </label>
    </section>

    <OfflineMapsSection />

    <RouteSettings />
  </div>
</template>
