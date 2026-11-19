<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Crosshair,
  Layers,
  LocateFixed,
  LocateOff,
  MapPinPlus,
  Minus,
  Navigation,
  Plus,
  Ruler,
  Settings2,
  SquareDashedMousePointer,
  Undo2,
  X,
} from '@lucide/vue'
import MapFeatureCard from '@/components/map/MapFeatureCard.vue'
import MapInfoPanel from '@/components/map/MapInfoPanel.vue'
import { LazyMapCanvas } from '@/components/map/lazyMap'
import { useFormat } from '@/composables/useFormat'
import { usePositionLog } from '@/composables/usePositionLog'
import { useTheme } from '@/composables/useTheme'
import { useGpsStore } from '@/stores/gps'
import { useMapStore } from '@/stores/map'
import { useNavigationStore } from '@/stores/navigation'
import { useToastStore } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'

/**
 * Pestaña Mapa a pantalla completa. Controles pensados para el pulgar en un teléfono (Flutter usaba un
 * "speed dial"): a la derecha zoom, centrar/seguir al buque y ajustes; abajo cursor, medición y sus acciones.
 * El cursor es el centro del mapa (retícula): se mueve el mapa, no el cursor.
 */
const { t } = useI18n()
const f = useFormat()
const theme = useTheme()
const gps = useGpsStore()
const map = useMapStore()
const nav = useNavigationStore()
const ui = useUiStore()
const toast = useToastStore()
const { openSaveAt } = usePositionLog()

const zoom = (d: number) => map.controller?.zoomBy(d)

/** Primer toque: centra en el buque y lo sigue. Siguiendo: deja de seguir. */
function locate() {
  const c = gps.current
  if (!c) {
    gps.start()
    return
  }
  if (map.following) map.following = false
  else {
    map.following = true
    map.controller?.flyTo(c, Math.max(map.zoom, 12))
  }
}

function navigateToCursor() {
  const name = t('mapInfo.cursorTarget')
  nav.setTarget({ name, lat: map.center.lat, lon: map.center.lon, waypointId: null })
  toast.push(t('destination.targetSet', { name }), { tone: 'success' })
}

const night = computed(() => theme.resolved.value === 'night')
</script>

<template>
  <div class="map-screen">
    <LazyMapCanvas />
    <!-- Tema nocturno: el mapa se tiñe de rojo para no encandilar en el puente. -->
    <div v-if="night" class="map-night-tint" aria-hidden="true"></div>

    <!-- Cursor: centro del mapa -->
    <div v-if="map.cursorVisible" class="map-crosshair" aria-hidden="true">
      <Crosshair class="size-10" :stroke-width="1.5" />
    </div>

    <div class="map-overlay-top">
      <MapInfoPanel />
    </div>

    <div class="map-overlay-right">
      <button type="button" class="map-fab" :aria-label="t('mapControls.zoomIn')" :title="t('mapControls.zoomIn')" @click="zoom(1)">
        <Plus class="size-5" />
      </button>
      <button type="button" class="map-fab" :aria-label="t('mapControls.zoomOut')" :title="t('mapControls.zoomOut')" @click="zoom(-1)">
        <Minus class="size-5" />
      </button>
      <button
        type="button"
        class="map-fab"
        :aria-pressed="map.following"
        :aria-label="map.following ? t('mapControls.stopFollowing') : gps.current ? t('mapControls.follow') : t('gps.activate')"
        :title="map.following ? t('mapControls.stopFollowing') : gps.current ? t('mapControls.follow') : t('gps.activate')"
        @click="locate"
      >
        <LocateOff v-if="!gps.active" class="size-5" />
        <LocateFixed v-else class="size-5" :class="{ 'text-accent': map.following }" />
      </button>
      <button type="button" class="map-fab" :aria-label="t('layers.title')" :title="t('layers.title')" @click="ui.open('layers')">
        <Layers class="size-5" />
      </button>
      <button type="button" class="map-fab" :aria-label="t('mapSettings.title')" :title="t('mapSettings.title')" @click="ui.open('mapSettings')">
        <Settings2 class="size-5" />
      </button>
    </div>

    <div class="map-overlay-bottom">
      <MapFeatureCard v-if="map.selected" />

      <!-- Medición -->
      <div v-else-if="map.measuring" class="map-card">
        <div class="flex items-center gap-3">
          <Ruler class="size-5 shrink-0 text-accent" aria-hidden="true" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="eyebrow">{{ t('mapMeasure.total') }}</span>
            <span class="numeric text-xl font-medium">{{ f.distance(map.measureNm) }} {{ t('units.nm') }}</span>
          </div>
          <button type="button" class="icon-btn" :aria-label="t('mapMeasure.stop')" @click="map.stopMeasuring()"><X class="size-5" /></button>
        </div>
        <p v-if="!map.measurePoints.length" class="text-caption">{{ t('mapMeasure.hint') }}</p>
        <div class="grid grid-cols-2 gap-2">
          <button type="button" class="btn-secondary" :disabled="!map.measurePoints.length" @click="map.undoPoint()">
            <Undo2 class="size-4" aria-hidden="true" />{{ t('mapMeasure.undo') }}
          </button>
          <button type="button" class="btn-primary" @click="map.markPoint()">
            <Plus class="size-4" aria-hidden="true" />{{ t('mapMeasure.mark') }}
          </button>
        </div>
      </div>

      <!-- Acciones del cursor -->
      <div v-else class="flex flex-col gap-2">
        <div v-if="map.cursorVisible" class="grid grid-cols-2 gap-2">
          <button type="button" class="map-chip justify-center" @click="openSaveAt(map.center)">
            <MapPinPlus class="size-4" aria-hidden="true" />{{ t('mapControls.saveAtCursor') }}
          </button>
          <button type="button" class="map-chip justify-center" @click="navigateToCursor">
            <Navigation class="size-4 text-accent" aria-hidden="true" />{{ t('mapControls.navigateToCursor') }}
          </button>
        </div>
        <div class="flex justify-center gap-2">
          <button type="button" class="map-chip" :aria-pressed="map.cursorVisible" @click="map.setCursor(!map.cursorVisible)">
            <SquareDashedMousePointer class="size-4" aria-hidden="true" />{{ map.cursorVisible ? t('mapControls.hideCursor') : t('mapControls.showCursor') }}
          </button>
          <button type="button" class="map-chip" @click="map.startMeasuring()">
            <Ruler class="size-4" aria-hidden="true" />{{ t('mapMeasure.start') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
