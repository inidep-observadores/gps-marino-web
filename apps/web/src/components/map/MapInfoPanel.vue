<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronUp } from '@lucide/vue'
import { bearingDeg, distanceNm } from '@gpsm/shared'
import { useFormat } from '@/composables/useFormat'
import { useGpsStore } from '@/stores/gps'
import { useMapStore } from '@/stores/map'
import { useNavigationStore } from '@/stores/navigation'

/**
 * Ventana de información sobre el mapa (`map_info_window.dart` de Flutter): posición, velocidad y rumbo del
 * buque; destino/próximo punto con distancia, rumbo y ETA; y con el cursor visible, su posición y la distancia
 * y marcación desde el buque. Se puede plegar para dejar más mapa libre (queda una sola línea).
 */
const { t } = useI18n()
const f = useFormat()
const gps = useGpsStore()
const map = useMapStore()
const nav = useNavigationStore()
/** En el teléfono empieza plegado (una línea con lo esencial) para dejar más mapa a la vista. */
const open = ref(window.matchMedia('(min-width: 640px)').matches)

const multi = computed(() => nav.route.length > 1)
const eta = computed(() => {
  const ms = nav.eta
  if (ms == null) return '--:--'
  return new Date(ms).toDateString() === new Date().toDateString() ? f.time(ms) : f.dateTime(ms)
})
const toCursor = computed(() =>
  gps.current ? { nm: distanceNm(gps.current, map.center), brg: bearingDeg(gps.current, map.center) } : null,
)
</script>

<template>
  <section class="map-panel" :aria-label="t('map.info')">
    <button type="button" class="flex w-full items-center gap-2 text-left" :aria-expanded="open" @click="open = !open">
      <span class="numeric min-w-0 flex-1 truncate text-sm font-medium">
        <template v-if="gps.current">{{ f.speed(gps.speedKn) }} {{ t('units.kn') }} · {{ f.bearing(gps.courseDeg) }}</template>
        <template v-else>{{ t(`gps.status.${gps.status}`) }}</template>
        <template v-if="nav.next"> · {{ f.distance(nav.nextLeg?.distanceNm) }} {{ t('units.nm') }} → {{ nav.next.name }}</template>
      </span>
      <ChevronUp v-if="open" class="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
      <ChevronDown v-else class="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
    </button>

    <dl v-if="open && (gps.current || nav.next || map.cursorVisible)" class="map-panel-grid">
      <div v-if="gps.current" class="col-span-2">
        <dt>{{ t('mapInfo.position') }}</dt>
        <dd>{{ f.lat(gps.current.lat) }} · {{ f.lon(gps.current.lon) }}</dd>
      </div>

      <template v-if="nav.next && !multi">
        <div class="col-span-2">
          <dt>{{ t('navigation.target') }}</dt>
          <dd class="truncate font-sans font-semibold">{{ nav.next.name }}</dd>
        </div>
        <div>
          <dt>{{ t('navigation.distance') }}</dt>
          <dd>{{ f.distance(nav.nextLeg?.distanceNm) }} {{ t('units.nm') }}</dd>
        </div>
        <div>
          <dt>{{ t('navigation.legBearing') }} · {{ t('navigation.eta') }}</dt>
          <dd>{{ f.bearing(nav.nextLeg?.bearingDeg) }} · {{ eta }}</dd>
        </div>
      </template>

      <template v-else-if="nav.next && nav.final">
        <div>
          <dt>{{ t('navigation.nextPoint') }}</dt>
          <dd class="truncate font-sans font-semibold">{{ nav.next.name }}</dd>
        </div>
        <div>
          <dt>{{ t('navigation.distance') }} · {{ t('navigation.legBearing') }}</dt>
          <dd>{{ f.distance(nav.nextLeg?.distanceNm) }} · {{ f.bearing(nav.nextLeg?.bearingDeg) }}</dd>
        </div>
        <div>
          <dt>{{ t('navigation.finalTarget') }}</dt>
          <dd class="truncate font-sans font-semibold">{{ nav.final.name }}</dd>
        </div>
        <div>
          <dt>{{ t('navigation.totalDistance') }} · {{ t('navigation.eta') }}</dt>
          <dd>{{ f.distance(nav.totalNm) }} · {{ eta }}</dd>
        </div>
      </template>

      <template v-if="map.cursorVisible">
        <div class="col-span-2 border-t border-line pt-1.5">
          <dt>{{ t('mapInfo.cursor') }}</dt>
          <dd>{{ f.lat(map.center.lat) }} · {{ f.lon(map.center.lon) }}</dd>
        </div>
        <div v-if="toCursor" class="col-span-2">
          <dt>{{ t('mapInfo.fromVessel') }}</dt>
          <dd>{{ f.distance(toCursor.nm) }} {{ t('units.nm') }} · {{ f.bearing(toCursor.brg) }}</dd>
        </div>
      </template>
    </dl>
  </section>
</template>
