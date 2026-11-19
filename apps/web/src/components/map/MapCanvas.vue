<script setup lang="ts">
/**
 * Mapa náutico (MapLibre GL). Se carga diferido (`lazyMap.ts`) pero se precachea con la app: en altamar
 * tiene que abrir sin red. Lee los stores directamente (hay un solo mapa) y le registra a `map` un controlador
 * para acercar, alejar y centrar.
 *
 * Capas propias (se vuelven a agregar en cada `style.load`: al cambiar tipo de mapa o tema):
 * señales náuticas (opcional), anillos de distancia, ruta y sus puntos, línea COG, ubicaciones visibles,
 * medición y el buque. Si el estilo base no llega (sin conexión y sin caché) se usa un estilo local vacío
 * para que el buque, la ruta y las ubicaciones se sigan viendo.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  addProtocol,
  AttributionControl,
  Map as MapLibre,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// El worker de MapLibre se empaqueta con `?worker&url` (como en Drone Forecast): funciona en desarrollo y producción.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  cogLine,
  distanceRings,
  emptyCollection,
  routeLine,
  routePoints,
  toPos,
  waypointFeatures,
  type LatLon,
} from '@gpsm/shared'
import { useTheme } from '@/composables/useTheme'
import { useGpsStore } from '@/stores/gps'
import { useMapStore } from '@/stores/map'
import { useNavigationStore } from '@/stores/navigation'
import { useWaypointsStore } from '@/stores/waypoints'
import { markImage, vesselImage, vesselStillImage } from './mapImages'
import { GLYPHS, LABEL_FONT, LABEL_FONT_BOLD, SEAMARKS_ATTR, SEAMARKS_TILES, palette, rasterBaseStyle, type Palette } from './mapStyles'
import { OFM_PROTOCOL, loadStandardStyle, ofmTileHandler, trimTileCache } from './offlineTiles'

setWorkerUrl(mapWorkerUrl)
// Teselas vectoriales con caché propio sin versión en la clave (ver offlineTiles.ts).
addProtocol(OFM_PROTOCOL, ofmTileHandler)

const { t } = useI18n()
const theme = useTheme()
const gps = useGpsStore()
const mapStore = useMapStore()
const nav = useNavigationStore()
const waypoints = useWaypointsStore()

const container = ref<HTMLDivElement | null>(null)
/** El estilo base no se pudo cargar (sin conexión y sin caché): se dibuja sobre un fondo liso. */
const offlineBase = ref(false)
let map: MapLibre | null = null
let colors: Palette
let observer: ResizeObserver | null = null

const EMPTY = emptyCollection()
const feature = (geometry: unknown) => (geometry ? { type: 'Feature' as const, properties: {}, geometry } : EMPTY)

// ---------- Datos de las capas ----------
const vesselData = () => {
  const c = gps.current
  if (!c || !mapStore.settings.showVessel) return EMPTY
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: toPos(c) },
    properties: { course: gps.courseDeg ?? 0, still: gps.courseDeg == null },
  }
}
const ringsData = () => {
  const c = gps.current
  const r = mapStore.settings.rings
  return c && r.show ? distanceRings(c, r.count, r.spacingNm) : { rings: EMPTY, labels: EMPTY }
}
const cogData = () => {
  const c = gps.current
  const s = mapStore.settings.cog
  return c && s.show ? feature(cogLine(c, gps.courseDeg, gps.speedKn, s.minutes)) : EMPTY
}
const routeData = () => feature(routeLine(gps.current, nav.route))
const routePointsData = () => routePoints(nav.route)
const waypointsData = () => waypointFeatures(waypoints.items)
const measureData = () => {
  const pts: LatLon[] = mapStore.measurePoints
  if (!mapStore.measuring || !pts.length) return EMPTY
  return {
    type: 'FeatureCollection' as const,
    features: [
      ...(pts.length > 1 ? [{ type: 'Feature' as const, properties: { kind: 'fixed' }, geometry: { type: 'LineString' as const, coordinates: pts.map(toPos) } }] : []),
      { type: 'Feature' as const, properties: { kind: 'live' }, geometry: { type: 'LineString' as const, coordinates: [toPos(pts[pts.length - 1]!), toPos(mapStore.center)] } },
      ...pts.map((p) => ({ type: 'Feature' as const, properties: { kind: 'point' }, geometry: { type: 'Point' as const, coordinates: toPos(p) } })),
    ],
  }
}

const source = (id: string) => map?.getSource(id) as GeoJSONSource | undefined
const set = (id: string, data: unknown) => source(id)?.setData(data as Parameters<GeoJSONSource['setData']>[0])

/**
 * Registra en el estilo actual las imágenes de los íconos de las ubicaciones visibles. Se hace explícitamente
 * (al armar las capas y cuando cambian las ubicaciones) porque `styleimagemissing` falla al cambiar de estilo.
 */
function ensureMarkImages(m: MapLibre) {
  const ratio = window.devicePixelRatio || 1
  const ids = new Set(waypointsData().features.map((f) => f.properties.image))
  for (const id of ids) {
    if (m.hasImage(id)) continue
    const img = markImage(id, colors ?? palette(), ratio)
    if (img) m.addImage(id, img, { pixelRatio: ratio })
  }
}

/** Agrega fuentes, imágenes y capas propias sobre el estilo base. */
function addOverlay(m: MapLibre) {
  colors = palette()
  const ratio = window.devicePixelRatio || 1
  m.addImage('vessel', vesselImage(colors, ratio), { pixelRatio: ratio })
  m.addImage('vessel-still', vesselStillImage(colors, ratio), { pixelRatio: ratio })
  ensureMarkImages(m)

  if (mapStore.settings.seamarks) {
    m.addSource('seamarks', { type: 'raster', tiles: [SEAMARKS_TILES], tileSize: 256, minzoom: 6, maxzoom: 18, attribution: SEAMARKS_ATTR })
    m.addLayer({ id: 'seamarks', type: 'raster', source: 'seamarks' })
  }

  const rings = ringsData()
  m.addSource('rings', { type: 'geojson', data: rings.rings })
  m.addSource('rings-labels', { type: 'geojson', data: rings.labels })
  m.addSource('cog', { type: 'geojson', data: cogData() })
  m.addSource('route', { type: 'geojson', data: routeData() })
  m.addSource('route-points', { type: 'geojson', data: routePointsData() })
  m.addSource('waypoints', { type: 'geojson', data: waypointsData() })
  // Las etiquetas van en una fuente aparte: si sin conexión faltan las fuentes tipográficas, MapLibre descarta
  // todos los símbolos de la tesela de esa fuente; así los íconos se siguen viendo aunque no haya etiquetas.
  m.addSource('waypoints-labels', { type: 'geojson', data: waypointsData() })
  m.addSource('measure', { type: 'geojson', data: measureData() })
  m.addSource('vessel', { type: 'geojson', data: vesselData() })

  const halo = { 'text-halo-color': colors.canvas, 'text-halo-width': 1.6 }
  m.addLayer({ id: 'rings', type: 'line', source: 'rings', paint: { 'line-color': colors.accent, 'line-width': 1.2, 'line-opacity': 0.7, 'line-dasharray': [4, 3] } })
  m.addLayer({
    id: 'rings-labels',
    type: 'symbol',
    source: 'rings-labels',
    layout: { 'text-field': ['concat', ['to-string', ['get', 'radiusNm']], ' Nm'], 'text-font': LABEL_FONT, 'text-size': 11, 'text-allow-overlap': true },
    paint: { 'text-color': colors.accent, ...halo },
  })
  m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.canvas, 'line-width': 6, 'line-opacity': 0.7 } })
  m.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.caution, 'line-width': 3 } })
  m.addLayer({ id: 'cog', type: 'line', source: 'cog', layout: { 'line-cap': 'round' }, paint: { 'line-color': colors.accent, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } })
  m.addLayer({
    id: 'route-points',
    type: 'circle',
    source: 'route-points',
    paint: {
      'circle-radius': ['match', ['get', 'role'], 'final', 9, 7],
      'circle-color': ['match', ['get', 'role'], 'final', colors.stop, colors.caution],
      'circle-stroke-color': colors.canvas,
      'circle-stroke-width': 2.5,
    },
  })
  m.addLayer({
    id: 'route-points-label',
    type: 'symbol',
    source: 'route-points',
    layout: { 'text-field': ['to-string', ['get', 'index']], 'text-font': LABEL_FONT_BOLD, 'text-size': 10, 'text-allow-overlap': true },
    paint: { 'text-color': colors.canvas },
  })
  m.addLayer({
    id: 'waypoints',
    type: 'symbol',
    source: 'waypoints',
    layout: { 'icon-image': ['get', 'image'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-padding': 0 },
  })
  m.addLayer({
    id: 'waypoints-label',
    type: 'symbol',
    source: 'waypoints-labels',
    minzoom: 11,
    layout: { 'text-field': ['get', 'name'], 'text-font': LABEL_FONT, 'text-size': 11, 'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': colors.ink, ...halo },
  })
  m.addLayer({
    id: 'measure-line',
    type: 'line',
    source: 'measure',
    filter: ['==', ['get', 'kind'], 'fixed'],
    paint: { 'line-color': colors.ink, 'line-width': 2.5 },
  })
  // Tramo dinámico hasta el cursor (punteado).
  m.addLayer({
    id: 'measure-live',
    type: 'line',
    source: 'measure',
    filter: ['==', ['get', 'kind'], 'live'],
    paint: { 'line-color': colors.ink, 'line-width': 2.5, 'line-dasharray': [1.5, 1.5] },
  })
  m.addLayer({
    id: 'measure-points',
    type: 'circle',
    source: 'measure',
    filter: ['==', ['get', 'kind'], 'point'],
    paint: { 'circle-radius': 5, 'circle-color': colors.surface, 'circle-stroke-color': colors.ink, 'circle-stroke-width': 2.5 },
  })
  m.addLayer({
    id: 'vessel',
    type: 'symbol',
    source: 'vessel',
    layout: {
      'icon-image': ['case', ['get', 'still'], 'vessel-still', 'vessel'],
      'icon-rotate': ['get', 'course'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
}

/** Estilo local mínimo (sin red): fondo liso y fuentes. Las capas de costas llegan con la fase 4. */
const fallbackStyle = (): StyleSpecification => ({
  version: 8,
  glyphs: GLYPHS,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': palette().surface } }],
})

let styleSeq = 0
/**
 * Aplica el estilo del tipo de mapa y el tema. El estándar se baja (o sale del caché del service worker); si no
 * hay red ni copia, se usa el estilo local para que lo propio siga visible.
 */
async function applyStyle() {
  const seq = ++styleSeq
  const type = mapStore.settings.mapType
  let style: StyleSpecification
  try {
    style = type === 'standard' ? await loadStandardStyle(theme.isDark.value) : rasterBaseStyle(type, palette().surface)
    offlineBase.value = false
  } catch {
    style = fallbackStyle()
    offlineBase.value = true
  }
  if (seq !== styleSeq || !map) return // llegó un pedido más nuevo mientras se bajaba este
  map.setStyle(style, { diff: false })
}

onMounted(() => {
  if (!container.value) return
  const cam = mapStore.camera
  map = new MapLibre({
    container: container.value,
    style: fallbackStyle(),
    center: [cam.lon, cam.lat],
    zoom: cam.zoom,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    maxPitch: 0,
  })
  map.touchZoomRotate.disableRotation()
  if (import.meta.env.DEV) (window as unknown as { __map: MapLibre }).__map = map
  map.addControl(new AttributionControl({ compact: true }), 'bottom-left')
  map.addControl(new ScaleControl({ unit: 'nautical', maxWidth: 110 }), 'bottom-left')

  map.on('style.load', () => {
    if (map) addOverlay(map)
  })
  void applyStyle()
  void trimTileCache()
  // Respaldo: un ícono que todavía no estaba registrado se dibuja cuando una capa lo pide.
  map.on('styleimagemissing', (e) => {
    if (!map) return
    const ratio = window.devicePixelRatio || 1
    const img = markImage(e.id, colors ?? palette(), ratio)
    try {
      if (img) map.addImage(e.id, img, { pixelRatio: ratio })
    } catch {
      /* ya estaba */
    }
  })
  let frame = 0
  map.on('move', () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!map) return
      const c = map.getCenter()
      mapStore.center = { lat: c.lat, lon: c.lng }
      mapStore.zoom = map.getZoom()
      if (mapStore.measuring) set('measure', measureData())
    })
  })
  map.on('moveend', () => {
    if (!map) return
    const c = map.getCenter()
    mapStore.saveCamera({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
  })
  // Si el usuario mueve el mapa con el dedo, deja de seguir al buque (como en Flutter).
  map.on('dragstart', () => (mapStore.following = false))

  map.on('click', 'waypoints', (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id as string | undefined
    if (id) mapStore.selected = { kind: 'waypoint', id }
  })
  map.on('click', (e) => {
    if (map?.getLayer('waypoints') && map.queryRenderedFeatures(e.point, { layers: ['waypoints'] }).length) return
    mapStore.selected = null
  })
  map.on('mouseenter', 'waypoints', () => map && (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'waypoints', () => map && (map.getCanvas().style.cursor = ''))

  mapStore.controller = {
    zoomBy: (d) => map?.easeTo({ zoom: map.getZoom() + d, duration: 250 }),
    flyTo: (p, zoom) => map?.easeTo({ center: [p.lon, p.lat], zoom: zoom ?? map.getZoom(), duration: 600 }),
  }

  observer = new ResizeObserver(() => map?.resize())
  observer.observe(container.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  mapStore.controller = null
  map?.remove()
  map = null
})

// ---------- Reacciones ----------
watch(
  () => [gps.current, gps.courseDeg, gps.speedKn, mapStore.settings.showVessel, mapStore.settings.rings, mapStore.settings.cog] as const,
  () => {
    set('vessel', vesselData())
    const r = ringsData()
    set('rings', r.rings)
    set('rings-labels', r.labels)
    set('cog', cogData())
    set('route', routeData())
    const c = gps.current
    if (c && mapStore.following && map) map.easeTo({ center: [c.lon, c.lat], duration: 500 })
  },
)
watch(
  () => nav.route,
  () => {
    set('route', routeData())
    set('route-points', routePointsData())
  },
  { deep: true },
)
watch(
  () => waypoints.items,
  () => {
    const data = waypointsData()
    if (map?.isStyleLoaded()) ensureMarkImages(map)
    set('waypoints', data)
    set('waypoints-labels', data)
  },
)
watch(() => [mapStore.measurePoints, mapStore.measuring] as const, () => set('measure', measureData()))
// Tipo de mapa, tema o señales náuticas: otro estilo; las capas propias vuelven en `style.load`.
watch(() => [mapStore.settings.mapType, mapStore.settings.seamarks, theme.resolved.value] as const, applyStyle)
</script>

<template>
  <div class="relative size-full">
    <div ref="container" class="map-canvas size-full" role="region" :aria-label="t('map.title')"></div>
    <p v-if="offlineBase" class="map-notice pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2" role="status">
      {{ t('map.offlineBase') }}
    </p>
  </div>
</template>

<style scoped>
/* Controles de MapLibre con los tokens del tema. */
:deep(.maplibregl-ctrl-attrib) {
  background: color-mix(in oklch, var(--ds-surface) 85%, transparent);
  color: var(--ds-ink-muted);
}
:deep(.maplibregl-ctrl-attrib a) {
  color: var(--ds-ink-muted);
}
:deep(.maplibregl-ctrl-scale) {
  background: color-mix(in oklch, var(--ds-surface) 80%, transparent);
  border-color: var(--ds-ink-muted);
  color: var(--ds-ink);
  font-family: var(--font-mono);
}
</style>
