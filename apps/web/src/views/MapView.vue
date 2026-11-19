<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Crosshair,
  Layers,
  LocateFixed,
  ListPlus,
  LocateOff,
  MapPinPlus,
  CloudSun,
  Circle,
  Square,
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
import WindTimeControl from '@/components/map/WindTimeControl.vue'
import { LazyMapCanvas } from '@/components/map/lazyMap'
import { useFormat } from '@/composables/useFormat'
import { usePositionLog } from '@/composables/usePositionLog'
import { useRouteActions } from '@/composables/useRouteActions'
import { useTheme } from '@/composables/useTheme'
import { useGpsStore } from '@/stores/gps'
import { useToastStore } from '@/stores/toast'
import { useMapStore } from '@/stores/map'
import { useNavigationStore } from '@/stores/navigation'
import { useUiStore } from '@/stores/ui'
import { useTracksStore } from '@/stores/tracks'
import { useWindStore } from '@/stores/wind'

/**
 * Pestaña Mapa a pantalla completa. Controles pensados para el pulgar en un teléfono (Flutter usaba un
 * "speed dial"): a la derecha zoom, centrar/seguir al buque y ajustes; abajo cursor, medición y sus acciones.
 * El cursor es el centro del mapa (retícula): se mueve el mapa, no el cursor.
 */
const { t } = useI18n()
const f = useFormat()
const theme = useTheme()
const gps = useGpsStore()
const toast = useToastStore()
const map = useMapStore()
const nav = useNavigationStore()
const ui = useUiStore()
const wind = useWindStore()
const tracks = useTracksStore()
const { openSaveAt } = usePositionLog()
const { hasRoute, addLabel, goOrAppend } = useRouteActions()

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

/**
 * Como en Flutter: sin ruta, "Navegar aquí" la inicia en el cursor; con una ruta en curso, el botón pasa a
 * "Añadir a la ruta" y suma un tramo. Los puntos del cursor se numeran para distinguirlos en la ruta.
 */
/**
 * Pronóstico: si el cursor está activo se toma su posición (el centro del mapa); si no, la última posición del GPS.
 * Sin ninguna de las dos no hay punto: se avisa qué hacer.
 */
function openForecast() {
  if (map.cursorVisible) return ui.openPointForecast(map.center, 'cursor')
  const c = gps.current
  if (c) return ui.openPointForecast({ lat: c.lat, lon: c.lon }, 'gps')
  toast.push(t('mapControls.forecastNoPoint'), { tone: 'warning' })
}

function cursorToRoute() {
  const name = hasRoute.value ? t('mapInfo.cursorPointN', { n: nav.route.length + 1 }) : t('mapInfo.cursorTarget')
  goOrAppend({ name, lat: map.center.lat, lon: map.center.lon, waypointId: null })
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
      <!-- La mira es semitransparente para que el objetivo se siga viendo debajo; el punto central queda más firme -->
      <Crosshair class="size-10 opacity-65" :stroke-width="1.5" />
      <!-- Punto central: marca el pixel exacto del cursor (el centro del mapa) para elegir con precisión -->
      <span class="absolute top-1/2 left-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink opacity-90"></span>
    </div>
    <!-- Viento: marca el punto del que salen los datos del encabezado (el centro del mapa). Con el cursor visible, la mira ya lo marca. -->
    <div v-else-if="wind.enabled && wind.atCenter" class="map-wind-marker" aria-hidden="true">
      <span class="map-wind-marker-dot"></span>
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
      <!-- Grabar la derrota (la línea que recorre el buque) -->
      <button
        type="button"
        class="map-fab"
        :aria-pressed="!!tracks.recording"
        :aria-label="tracks.recording ? t('tracks.stop') : t('tracks.record')"
        :title="tracks.recording ? t('tracks.stop') : t('tracks.record')"
        @click="tracks.recording ? tracks.stop() : tracks.start()"
      >
        <Square v-if="tracks.recording" class="size-5 fill-current text-mark-red" />
        <Circle v-else class="size-5 text-mark-red" />
      </button>
      <button type="button" class="map-fab" :aria-label="t('layers.title')" :title="t('layers.title')" @click="ui.open('layers')">
        <Layers class="size-5" />
      </button>
      <button type="button" class="map-fab" :aria-label="t('mapSettings.title')" :title="t('mapSettings.title')" @click="ui.open('mapSettings')">
        <Settings2 class="size-5" />
      </button>
    </div>

    <div class="map-overlay-bottom">
      <!-- Viento: fecha y hora del pronóstico (se oculta mientras hay ficha o medición, para no apilar tarjetas). -->
      <WindTimeControl v-if="wind.enabled && !map.selected && !map.measuring" class="mb-2" />

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
          <button type="button" class="map-chip justify-center" @click="cursorToRoute">
            <ListPlus v-if="hasRoute" class="size-4 text-accent" aria-hidden="true" />
            <Navigation v-else class="size-4 text-accent" aria-hidden="true" />{{ addLabel }}
          </button>
        </div>
        <!-- Herramientas: una sola fila que se desplaza de lado (con muchas opciones no se apila en varias filas) -->
        <div class="chip-strip">
          <div class="chip-strip-inner">
          <button type="button" class="map-chip" :aria-pressed="map.cursorVisible" @click="map.setCursor(!map.cursorVisible)">
            <SquareDashedMousePointer class="size-4" aria-hidden="true" />{{ map.cursorVisible ? t('mapControls.hideCursor') : t('mapControls.showCursor') }}
          </button>
          <!-- Pronóstico de viento y olas del cursor (si está activo) o de la posición del GPS. -->
          <button type="button" class="map-chip" @click="openForecast">
            <CloudSun class="size-4" aria-hidden="true" />{{ t('mapControls.forecast') }}
          </button>
          <button type="button" class="map-chip" @click="map.startMeasuring()">
            <Ruler class="size-4" aria-hidden="true" />{{ t('mapMeasure.start') }}
          </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
