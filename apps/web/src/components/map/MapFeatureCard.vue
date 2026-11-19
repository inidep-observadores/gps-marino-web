<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EyeOff, ListPlus, MapPin, Navigation, Pencil, Spline, X } from '@lucide/vue'
import { bearingDeg, distanceNm, etaMs, featureAnchor, relatedFeatureIds, type LatLon } from '@gpsm/shared'
import MarkGlyph from '@/components/marks/MarkGlyph.vue'
import ToggleRow from '@/components/ui/ToggleRow.vue'
import { useFormat } from '@/composables/useFormat'
import { useRouteActions } from '@/composables/useRouteActions'
import { useGpsStore } from '@/stores/gps'
import { useLayersStore } from '@/stores/layers'
import { useMapStore } from '@/stores/map'
import { useUiStore } from '@/stores/ui'
import { useWaypointsStore } from '@/stores/waypoints'

/**
 * Ficha del elemento tocado en el mapa (`selected_map_feature_card.dart`): título, información, distancia,
 * rumbo y ETA desde el buque y un botón que navega hacia allí o, con una ruta en curso, la agrega como tramo
 * (como en Flutter). Para ubicaciones: ocultar y editar.
 * Para elementos de capas importadas: interruptor "Ocultar en mapa" (una línea arrastra los puntos de sus extremos).
 */
const { t } = useI18n()
const f = useFormat()
const gps = useGpsStore()
const map = useMapStore()
const ui = useUiStore()
const waypoints = useWaypointsStore()
const layers = useLayersStore()
const { hasRoute, addLabel, goOrAppend } = useRouteActions()

const sel = computed(() => map.selected)
const wp = computed(() => (sel.value?.kind === 'waypoint' ? waypoints.byId(sel.value.id) : null))

/** Elemento de capa seleccionado, con su capa y propiedades originales. */
const layerFeature = computed(() => {
  const s = sel.value
  if (s?.kind !== 'feature') return null
  const r = layers.renderLayers.find((x) => x.sourceId === s.sourceId)
  const feat = r?.parsed.features.find((x) => x.properties._id === s.featureId)
  if (!r || !feat) return null
  const props = r.parsed.props[s.featureId] ?? {}
  const imported = r.layerId ? layers.imported.find((l) => l.id === r.layerId) : undefined
  return { r, feat, props, imported }
})

const title = computed(() => {
  if (wp.value) return wp.value.description || t('destination.unnamed')
  const lf = layerFeature.value
  return lf?.feat.properties._title || t('mapCard.defaultTitle')
})
const description = computed(() => layerFeature.value?.feat.properties._desc ?? '')
const position = computed<LatLon | null>(() => {
  if (wp.value) return { lat: wp.value.lat, lon: wp.value.lon }
  const lf = layerFeature.value
  if (!lf) return null
  const [lon, lat] = featureAnchor(lf.feat)
  return { lat, lon }
})

const navData = computed(() => {
  const c = gps.current
  const p = position.value
  if (!c || !p) return null
  const nm = distanceNm(c, p)
  return { nm, brg: bearingDeg(c, p), eta: etaMs(nm, gps.speedKn, c.t) }
})

const point = () => ({ name: title.value, lat: position.value!.lat, lon: position.value!.lon, waypointId: wp.value?.id ?? null })

/** Un solo botón, como en Flutter: navega si no hay ruta o agrega un tramo a la ruta en curso. */
function toRoute() {
  goOrAppend(point())
  map.selected = null
}
async function hideWaypoint() {
  await waypoints.setVisible([wp.value!.id], false)
  map.selected = null
}
function edit() {
  ui.openWaypoint(wp.value!.id)
  map.selected = null
}

const hiddenToggle = computed({
  get: () => {
    const lf = layerFeature.value
    return !!lf?.imported?.hiddenFeatures.includes(lf.feat.properties._id)
  },
  set: (hide: boolean) => {
    const lf = layerFeature.value
    if (!lf?.imported) return
    void layers.setHidden(lf.imported.id, relatedFeatureIds(lf.r.parsed, lf.feat.properties._id), hide)
  },
})
</script>

<template>
  <section v-if="wp || layerFeature" class="map-card" :aria-label="title">
    <div class="flex items-start gap-3">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
        <MarkGlyph v-if="wp" :icon="wp.icon" :color="wp.color" />
        <Spline v-else-if="layerFeature?.feat.geometry.type === 'LineString'" class="size-5 text-accent" aria-hidden="true" />
        <MapPin v-else class="size-5 text-accent" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 class="truncate font-semibold" :class="{ 'text-ink-subtle italic': wp && !wp.description }">{{ title }}</h2>
        <template v-if="wp">
          <p class="numeric text-xs text-ink-muted">{{ f.date(wp.recordedAt) }} {{ f.time(wp.recordedAt) }}</p>
          <p class="numeric text-xs text-ink-subtle">{{ f.lat(wp.lat) }} · {{ f.lon(wp.lon) }}</p>
        </template>
        <template v-else>
          <p v-if="description" class="line-clamp-3 text-xs whitespace-pre-line text-ink-muted">{{ description }}</p>
          <p v-else class="text-xs text-ink-subtle italic">{{ t('mapCard.noInfo') }}</p>
          <p v-if="layerFeature?.imported" class="eyebrow mt-0.5 truncate">{{ layerFeature.imported.name }}</p>
        </template>
      </div>
      <button type="button" class="icon-btn -mt-1 -mr-1" :aria-label="t('common.close')" @click="map.selected = null">
        <X class="size-5" />
      </button>
    </div>

    <dl v-if="navData" class="grid grid-cols-3 gap-2 rounded-xl bg-surface-2/70 px-3 py-2">
      <div>
        <dt class="eyebrow text-[0.6rem]">{{ t('navigation.distance') }}</dt>
        <dd class="numeric text-sm">{{ f.distance(navData.nm) }} {{ t('units.nm') }}</dd>
      </div>
      <div>
        <dt class="eyebrow text-[0.6rem]">{{ t('navigation.legBearing') }}</dt>
        <dd class="numeric text-sm">{{ f.bearing(navData.brg) }}</dd>
      </div>
      <div>
        <dt class="eyebrow text-[0.6rem]">{{ t('navigation.eta') }}</dt>
        <dd class="numeric text-sm">{{ navData.eta ? f.time(navData.eta) : '--:--' }}</dd>
      </div>
    </dl>

    <ToggleRow v-if="layerFeature?.imported" v-model="hiddenToggle" :label="t('mapCard.hideOnMap')" />

    <div class="grid gap-1.5" :class="wp ? 'grid-cols-3' : 'grid-cols-1'">
      <button type="button" class="selection-action" @click="toRoute">
        <ListPlus v-if="hasRoute" class="size-5 text-accent" aria-hidden="true" />
        <Navigation v-else class="size-5 text-accent" aria-hidden="true" /><span>{{ addLabel }}</span>
      </button>
      <template v-if="wp">
        <button type="button" class="selection-action" @click="hideWaypoint">
          <EyeOff class="size-5" aria-hidden="true" /><span>{{ t('mapCard.hide') }}</span>
        </button>
        <button type="button" class="selection-action" @click="edit">
          <Pencil class="size-5" aria-hidden="true" /><span>{{ t('mapCard.edit') }}</span>
        </button>
      </template>
    </div>
  </section>
</template>
