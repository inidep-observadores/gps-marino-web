<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ListPlus, Navigation, Search } from '@lucide/vue'
import { bearingDeg, distanceNm, matchesSearch, type RoutePoint, type Waypoint } from '@gpsm/shared'
import MarkGlyph from '@/components/marks/MarkGlyph.vue'
import { useFormat } from '@/composables/useFormat'
import { useGpsStore } from '@/stores/gps'
import { useNavigationStore } from '@/stores/navigation'
import { useToastStore } from '@/stores/toast'
import { useWaypointsStore } from '@/stores/waypoints'

/** "Seleccione destino": lista de ubicaciones guardadas para navegar hacia una o sumarla a la ruta. */
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const f = useFormat()
const gps = useGpsStore()
const nav = useNavigationStore()
const waypoints = useWaypointsStore()
const toast = useToastStore()

const query = ref('')
onMounted(() => void waypoints.load())

const nameOf = (w: Waypoint) => w.description || t('destination.unnamed')

const filtered = computed(() => waypoints.items.filter((w) => matchesSearch(w.description, query.value)))

/** Distancia y marcación desde la posición actual, si hay fix. */
function relative(w: Waypoint) {
  const c = gps.current
  return c ? { nm: distanceNm(c, w), brg: bearingDeg(c, w) } : null
}

const toPoint = (w: Waypoint): RoutePoint => ({ name: nameOf(w), lat: w.lat, lon: w.lon, waypointId: w.id })

function navigate(w: Waypoint) {
  nav.setTarget(toPoint(w))
  toast.push(t('destination.targetSet', { name: nameOf(w) }), { tone: 'success' })
  emit('done')
}

function append(w: Waypoint) {
  nav.append(toPoint(w))
  toast.push(t('destination.added', { name: nameOf(w) }), { tone: 'success' })
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <label class="input-group">
      <Search class="input-icon" aria-hidden="true" />
      <input v-model="query" type="search" class="input pl-10" :placeholder="t('destination.search')" :aria-label="t('destination.search')" />
    </label>

    <p v-if="!waypoints.items.length && waypoints.loaded" class="text-caption py-6 text-center">{{ t('destination.empty') }}</p>
    <p v-else-if="!filtered.length && waypoints.loaded" class="text-caption py-6 text-center">{{ t('destination.noResults') }}</p>

    <ul v-else class="list">
      <li v-for="w in filtered" :key="w.id" class="flex items-center gap-1 pr-2">
        <button type="button" class="list-row min-w-0 flex-1" :title="t('destination.setTarget')" @click="navigate(w)">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-base">
            <MarkGlyph :icon="w.icon" :color="w.color" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium" :class="{ 'text-ink-subtle italic': !w.description }">{{ nameOf(w) }}</span>
            <span class="numeric flex flex-col text-xs leading-snug text-ink-subtle min-[420px]:flex-row min-[420px]:gap-2"><span>{{ f.lat(w.lat) }}</span><span>{{ f.lon(w.lon) }}</span></span>
          </span>
          <span v-if="relative(w)" class="numeric flex shrink-0 flex-col items-end text-xs text-ink-muted">
            <span>{{ f.distance(relative(w)!.nm) }} {{ t('units.nm') }}</span>
            <span>{{ f.bearing(relative(w)!.brg) }}</span>
          </span>
          <Navigation class="size-4 shrink-0 text-accent" aria-hidden="true" />
        </button>
        <button type="button" class="icon-btn" :aria-label="`${t('destination.append')}: ${nameOf(w)}`" :title="t('destination.append')" @click="append(w)">
          <ListPlus class="size-[1.15rem]" />
        </button>
      </li>
    </ul>
  </div>
</template>
