<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EyeOff, ListPlus, Navigation, Pencil, X } from '@lucide/vue'
import MarkGlyph from '@/components/marks/MarkGlyph.vue'
import { useFormat } from '@/composables/useFormat'
import { useMapStore } from '@/stores/map'
import { useNavigationStore } from '@/stores/navigation'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Ficha del elemento tocado en el mapa (`selected_map_feature_card.dart`): título, fecha, hora y posición,
 * y las acciones "Navegar hacia aquí", "Añadir a la ruta", "Ocultar en mapa" (más "Editar" para ubicaciones).
 */
const { t } = useI18n()
const f = useFormat()
const map = useMapStore()
const nav = useNavigationStore()
const ui = useUiStore()
const waypoints = useWaypointsStore()
const toast = useToastStore()

const wp = computed(() => (map.selected?.kind === 'waypoint' ? waypoints.byId(map.selected.id) : null))
const name = computed(() => wp.value?.description || t('destination.unnamed'))
const point = () => ({ name: name.value, lat: wp.value!.lat, lon: wp.value!.lon, waypointId: wp.value!.id })

function navigate() {
  nav.setTarget(point())
  toast.push(t('destination.targetSet', { name: name.value }), { tone: 'success' })
  map.selected = null
}
function append() {
  nav.append(point())
  toast.push(t('destination.added', { name: name.value }), { tone: 'success' })
  map.selected = null
}
async function hide() {
  await waypoints.setVisible([wp.value!.id], false)
  map.selected = null
}
function edit() {
  ui.openWaypoint(wp.value!.id)
  map.selected = null
}
</script>

<template>
  <section v-if="wp" class="map-card" :aria-label="name">
    <div class="flex items-start gap-3">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
        <MarkGlyph :icon="wp.icon" :color="wp.color" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 class="truncate font-semibold" :class="{ 'text-ink-subtle italic': !wp.description }">{{ name }}</h2>
        <p class="numeric text-xs text-ink-muted">{{ f.date(wp.recordedAt) }} {{ f.time(wp.recordedAt) }}</p>
        <p class="numeric text-xs text-ink-subtle">{{ f.lat(wp.lat) }} · {{ f.lon(wp.lon) }}</p>
      </div>
      <button type="button" class="icon-btn -mt-1 -mr-1" :aria-label="t('common.close')" @click="map.selected = null">
        <X class="size-5" />
      </button>
    </div>
    <div class="grid grid-cols-4 gap-1.5">
      <button type="button" class="selection-action" @click="navigate">
        <Navigation class="size-5 text-accent" aria-hidden="true" /><span>{{ t('mapCard.navigate') }}</span>
      </button>
      <button type="button" class="selection-action" @click="append">
        <ListPlus class="size-5" aria-hidden="true" /><span>{{ t('mapCard.append') }}</span>
      </button>
      <button type="button" class="selection-action" @click="hide">
        <EyeOff class="size-5" aria-hidden="true" /><span>{{ t('mapCard.hide') }}</span>
      </button>
      <button type="button" class="selection-action" @click="edit">
        <Pencil class="size-5" aria-hidden="true" /><span>{{ t('mapCard.edit') }}</span>
      </button>
    </div>
  </section>
</template>
