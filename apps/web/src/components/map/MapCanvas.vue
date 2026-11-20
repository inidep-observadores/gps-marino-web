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
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  addProtocol,
  AttributionControl,
  Map as MapLibre,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// El worker de MapLibre se empaqueta con `?worker&url` (como en Drone Forecast): funciona en desarrollo y producción.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  buildGraticule,
  cogLine,
  distanceRings,
  emptyCollection,
  routeLine,
  routePoints,
  toPos,
  waypointFeatures,
  type LatLon,
  trackColorIndex,
} from '@gpsm/shared'
import { useTheme } from '@/composables/useTheme'
import { useGpsStore } from '@/stores/gps'
import { useLayersStore } from '@/stores/layers'
import { useMapStore } from '@/stores/map'
import { useNavigationStore } from '@/stores/navigation'
import { useTrackPlayerStore } from '@/stores/trackPlayer'
import { useTracksStore } from '@/stores/tracks'
import { useWaypointsStore } from '@/stores/waypoints'
import { useWindStore } from '@/stores/wind'
import { syncVectorLayers, tappableLayerIds } from './mapLayers'
import { markImage, vesselImage, vesselStillImage } from './mapImages'
import { GLYPHS, LABEL_FONT, LABEL_FONT_BOLD, SEAMARKS_ATTR, SEAMARKS_TILES, palette, rasterBaseStyle, trackColorExpr, type Palette } from './mapStyles'
import { NauticalScaleControl } from './nauticalScale'
import { WindBarbs } from './windBarbs'
import { WindParticles } from './windParticles'
import { OFM_PROTOCOL, loadStandardStyle, ofmTileHandler, trimTileCache } from './offlineTiles'

setWorkerUrl(mapWorkerUrl)
// Teselas vectoriales con caché propio sin versión en la clave (ver offlineTiles.ts).
addProtocol(OFM_PROTOCOL, ofmTileHandler)

const { t, locale } = useI18n()
const theme = useTheme()
const gps = useGpsStore()
const mapStore = useMapStore()
const nav = useNavigationStore()
const waypoints = useWaypointsStore()
const layers = useLayersStore()
const wind = useWindStore()
const tracks = useTracksStore()
const player = useTrackPlayerStore()

const container = ref<HTMLDivElement | null>(null)
const windCanvas = ref<HTMLCanvasElement | null>(null)
/** El estilo base no se pudo cargar (sin conexión y sin caché): se dibuja sobre un fondo liso. */
const offlineBase = ref(false)
let map: MapLibre | null = null
let colors: Palette
let observer: ResizeObserver | null = null
/** Partículas de la capa de viento (canvas encima del mapa). */
let particles: WindParticles | null = null
let barbs: WindBarbs | null = null
let scaleControl: NauticalScaleControl | null = null
/**
 * Las capas propias ya están armadas sobre el estilo actual. No se usa `map.isStyleLoaded()`: da falso mientras se
 * bajan teselas y se perderían cambios (capas importadas, íconos nuevos).
 */
let overlayReady = false

const EMPTY = emptyCollection()
const feature = (geometry: unknown) => (geometry ? { type: 'Feature' as const, properties: {}, geometry } : EMPTY)

// ---------- Unidades según el idioma ----------
/** Rótulo de la escala: `0,5 Mn` en español, `0.5 Nm` en inglés. */
const scaleLabel = (nm: number) => `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(nm)} ${t('units.nm')}`
/** Rótulo de cada anillo de distancia (número con el separador del idioma y la unidad). */
const ringLabelExpression = () =>
  ['concat', ['number-format', ['get', 'radiusNm'], { 'min-fraction-digits': 0, 'max-fraction-digits': 2, locale: locale.value }], ` ${t('units.nm')}`] as never
watch(locale, () => {
  scaleControl?.setFormat(scaleLabel)
  if (map?.getLayer('rings-labels')) map.setLayoutProperty('rings-labels', 'text-field', ringLabelExpression())
})

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
/** Derrota en reproducción: lo recorrido (continuo) y lo que falta (punteado). */
const playLinesData = () => {
  const sp = player.split
  if (!sp) return EMPTY
  const color = trackColorIndex(player.track?.id ?? '', player.track?.color)
  const line = (kind: string, c: [number, number][]) => ({ type: 'Feature' as const, properties: { kind, color }, geometry: { type: 'LineString' as const, coordinates: c } })
  return { type: 'FeatureCollection' as const, features: [sp.rest.length >= 2 ? line('rest', sp.rest) : null, sp.done.length >= 2 ? line('done', sp.done) : null].filter((f) => f != null) }
}
const playVesselData = () => {
  const p = player.position
  if (!p || !player.track) return EMPTY
  return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] }, properties: { course: p.courseDeg } }
}
/** Cuadrícula: líneas y etiquetas de la vista actual. Las etiquetas van pegadas a los bordes izquierdo (paralelos) y superior (meridianos). */
const graticuleData = () => {
  const g = mapStore.settings.graticule
  if (!map || !g.show || !container.value) return { lines: EMPTY, labels: EMPTY }
  const w = container.value.clientWidth
  const h = container.value.clientHeight
  if (!w || !h) return { lines: EMPTY, labels: EMPTY }
  const b = map.getBounds()
  const r = buildGraticule(
    { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
    { widthPx: w, heightPx: h },
    g.mode,
    { latLabelLon: map.unproject([10, h / 2]).lng, lonLabelLat: map.unproject([w / 2, 12]).lat, west: t('units.west') },
  )
  return { lines: r.lines, labels: r.labels }
}
const updateGraticule = () => {
  const g = graticuleData()
  set('graticule', g.lines)
  set('graticule-labels', g.labels)
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

  // Cuadrícula: las líneas van debajo de todo (también de las capas vectoriales); las etiquetas, encima de ellas.
  const grid = graticuleData()
  m.addSource('graticule', { type: 'geojson', data: grid.lines })
  m.addSource('graticule-labels', { type: 'geojson', data: grid.labels })
  m.addLayer({ id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': colors.inkMuted, 'line-width': 0.8, 'line-opacity': 0.4, 'line-dasharray': [2, 3] } })

  // Capas vectoriales (costas, límites, áreas, importadas): debajo de todo lo propio.
  syncVectorLayers(m, layers.renderLayers, { colors, showLabels: layers.showLabels, imported: layers.imported })

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
  m.addSource('tracks', { type: 'geojson', data: tracks.drawn as never })
  m.addSource('vessel', { type: 'geojson', data: vesselData() })
  m.addSource('trackplay', { type: 'geojson', data: playLinesData() })
  m.addSource('trackplay-vessel', { type: 'geojson', data: playVesselData() })

  const halo = { 'text-halo-color': colors.canvas, 'text-halo-width': 1.6 }
  m.addLayer({
    id: 'graticule-labels',
    type: 'symbol',
    source: 'graticule-labels',
    layout: {
      'text-field': ['get', 'text'],
      'text-font': LABEL_FONT,
      'text-size': 10,
      'text-anchor': ['match', ['get', 'axis'], 'lat', 'bottom-left', 'top'],
      'text-offset': ['match', ['get', 'axis'], 'lat', ['literal', [0.2, -0.2]], ['literal', [0, 0.2]]],
      'text-allow-overlap': false,
      'text-padding': 4,
    },
    paint: { 'text-color': colors.inkMuted, 'text-halo-color': colors.canvas, 'text-halo-width': 1.4, 'text-opacity': 0.9 },
  })
  m.addLayer({ id: 'rings', type: 'line', source: 'rings', paint: { 'line-color': colors.accent, 'line-width': 1.2, 'line-opacity': 0.7, 'line-dasharray': [4, 3] } })
  m.addLayer({
    id: 'rings-labels',
    type: 'symbol',
    source: 'rings-labels',
    layout: { 'text-field': ringLabelExpression(), 'text-font': LABEL_FONT, 'text-size': 11, 'text-allow-overlap': true },
    paint: { 'text-color': colors.accent, ...halo },
  })
  // Derrotas guardadas (cada una con su color) y la que se está grabando (rojo, para distinguirla del resto).
  m.addLayer({ id: 'tracks-casing', type: 'line', source: 'tracks', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.canvas, 'line-width': 5, 'line-opacity': 0.6 } })
  m.addLayer({
    id: 'tracks',
    type: 'line',
    source: 'tracks',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['case', ['get', 'active'], colors.markRed, trackColorExpr(colors)], 'line-width': 2.5 },
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
  // Derrota en reproducción: lo que falta, punteado y más suave; lo recorrido, continuo; y el buque en su posición.
  m.addLayer({ id: 'trackplay-casing', type: 'line', source: 'trackplay', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.canvas, 'line-width': 6, 'line-opacity': 0.6 } })
  m.addLayer({
    id: 'trackplay-rest',
    type: 'line',
    source: 'trackplay',
    filter: ['==', ['get', 'kind'], 'rest'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': trackColorExpr(colors), 'line-width': 2.5, 'line-opacity': 0.75, 'line-dasharray': [2, 2] },
  })
  m.addLayer({
    id: 'trackplay-done',
    type: 'line',
    source: 'trackplay',
    filter: ['==', ['get', 'kind'], 'done'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': trackColorExpr(colors), 'line-width': 3.5 },
  })
  // Aro de contraste bajo el buque de la derrota: así no se pierde sobre su propia línea.
  m.addLayer({
    id: 'trackplay-halo',
    type: 'circle',
    source: 'trackplay-vessel',
    paint: { 'circle-radius': 17, 'circle-color': colors.canvas, 'circle-opacity': 0.85, 'circle-stroke-color': colors.accent, 'circle-stroke-width': 2 },
  })
  m.addLayer({
    id: 'trackplay-vessel',
    type: 'symbol',
    source: 'trackplay-vessel',
    layout: { 'icon-image': 'vessel', 'icon-rotate': ['get', 'course'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
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
 * Aplica el estilo del tipo de mapa y el tema. El vectorial se baja (o sale del caché del service worker); si no
 * hay red ni copia, se usa el estilo local para que lo propio siga visible. Los raster no fallan: sus teselas salen del caché o quedan vacías.
 */
async function applyStyle() {
  const seq = ++styleSeq
  const type = mapStore.settings.mapType
  let style: StyleSpecification
  try {
    style = type === 'vector' ? await loadStandardStyle(theme.isDark.value) : rasterBaseStyle(type, palette().surface, theme.isDark.value)
    offlineBase.value = false
  } catch {
    style = fallbackStyle()
    offlineBase.value = true
  }
  if (seq !== styleSeq || !map) return // llegó un pedido más nuevo mientras se bajaba este
  overlayReady = false
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
  scaleControl = new NauticalScaleControl(scaleLabel, 110)
  map.addControl(scaleControl, 'bottom-right')

  map.on('style.load', () => {
    if (!map) return
    addOverlay(map)
    overlayReady = true
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
      updateGraticule()
    })
  })
  map.on('resize', updateGraticule)
  // Viento: el campo se pasa a pantalla de nuevo al terminar de mover (durante el gesto se detiene la animación).
  map.on('movestart', () => {
    if (!wind.enabled) return
    particles?.pause()
    particles?.clear()
    barbs?.clear()
  })
  map.on('moveend', () => {
    if (!map) return
    const c = map.getCenter()
    mapStore.saveCamera({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
    wind.setView(mapStore.controller!.getBounds())
    if (wind.enabled) showWind(false)
  })
  // Si el usuario mueve el mapa con el dedo, deja de seguir al buque (como en Flutter).
  map.on('dragstart', () => (mapStore.following = false))

  // Toque: primero las ubicaciones; si no, líneas y puntos de las capas (con margen para el dedo).
  map.on('click', (e) => {
    if (!map) return
    const box: [[number, number], [number, number]] = [
      [e.point.x - 10, e.point.y - 10],
      [e.point.x + 10, e.point.y + 10],
    ]
    const wp = map.getLayer('waypoints') ? map.queryRenderedFeatures(box, { layers: ['waypoints'] })[0] : undefined
    const wpId = wp?.properties?.id as string | undefined
    if (wpId) {
      mapStore.selected = { kind: 'waypoint', id: wpId }
      return
    }
    // Una derrota guardada: tocarla activa su reproductor (el mapa no salta al buque: se ve donde se tocó).
    const tr = map.getLayer('tracks') ? map.queryRenderedFeatures(box, { layers: ['tracks'] }).find((f) => !f.properties?.active) : undefined
    const trId = tr?.properties?.id as string | undefined
    if (trId) {
      mapStore.selected = null
      void player.open(trId).then((ok) => {
        if (ok) player.follow = false
      })
      return
    }
    const ids = tappableLayerIds(map, layers.renderLayers)
    const hit = ids.length ? map.queryRenderedFeatures(box, { layers: ids })[0] : undefined
    const featureId = hit?.properties?._id as string | undefined
    mapStore.selected = hit && featureId ? { kind: 'feature', sourceId: hit.source, featureId } : null
  })
  map.on('mouseenter', 'tracks', () => map && (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'tracks', () => map && (map.getCanvas().style.cursor = ''))
  map.on('mouseenter', 'waypoints', () => map && (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'waypoints', () => map && (map.getCanvas().style.cursor = ''))

  mapStore.controller = {
    zoomBy: (d) => map?.easeTo({ zoom: map.getZoom() + d, duration: 250 }),
    flyTo: (p, zoom) => map?.easeTo({ center: [p.lon, p.lat], zoom: zoom ?? map.getZoom(), duration: 600 }),
    fitTo: (pts) => {
      if (!map || pts.length < 2) return
      const b = pts.reduce((a, p) => ({ w: Math.min(a.w, p.lon), s: Math.min(a.s, p.lat), e: Math.max(a.e, p.lon), n: Math.max(a.n, p.lat) }), { w: 180, s: 90, e: -180, n: -90 })
      map.fitBounds([[b.w, b.s], [b.e, b.n]], { padding: { top: 90, bottom: 190, left: 40, right: 70 }, duration: 700, maxZoom: 14 })
    },
    getBounds: () => {
      const b = map!.getBounds()
      return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }
    },
  }

  // Una derrota activa antes de abrir el mapa (se eligió en la pestaña Derrotas): se encuadra al montarse.
  if (player.track) mapStore.controller?.fitTo(player.points)

  // Capa de viento: el canvas va encima del mapa y no recibe toques (el mapa sigue siendo tocable).
  if (windCanvas.value) {
    particles = new WindParticles(windCanvas.value, map, windColors(), window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    particles.resize()
    barbs = new WindBarbs(windCanvas.value, map, barbColors())
  }
  observer = new ResizeObserver(() => {
    map?.resize()
    particles?.resize()
    // Las flechas usan el tamaño y la transformación que acaba de fijar `particles.resize()`.
    if (wind.enabled && wind.windStyle === 'barbs') barbs?.draw()
  })
  observer.observe(container.value)
  // Primera grilla: ya hay una vista (la cámara guardada).
  wind.setView(mapStore.controller!.getBounds())
})

onBeforeUnmount(() => {
  observer?.disconnect()
  particles?.destroy()
  particles = null
  mapStore.controller = null
  map?.remove()
  map = null
})

/** Las flechas llevan además un contorno del color del fondo. */
function barbColors() {
  return { ...windColors(), halo: palette().canvas }
}

/**
 * Dibuja el viento con el estilo elegido (partículas animadas o flechas) sobre el mismo canvas.
 * `reseed`: al cambiar de estilo o encender la capa se reinicia todo; al mover el mapa solo se recalcula.
 */
function showWind(_reseed = true) {
  if (!wind.enabled) {
    particles?.setField(null)
    barbs?.setField(null)
    return
  }
  if (wind.windStyle === 'barbs') {
    particles?.setField(null)
    barbs?.setField(wind.field)
  } else {
    barbs?.setField(null)
    particles?.setField(wind.field)
  }
}

/** Colores de las partículas por intensidad (tokens del tema, convertidos a rgb para el canvas). */
function windColors() {
  const c = palette()
  return { calm: c.go, fresh: c.caution, strong: c.markOrange, gale: c.stop }
}

// ---------- Reacciones ----------
// Viento: otra hora = el mismo campo con otros valores (las partículas en el aire siguen su camino);
// apagar la capa detiene y borra la animación; encenderla pide la grilla de lo visible y la arranca.
watch(
  () => wind.field,
  (f) => {
    if (!wind.enabled) return
    if (wind.windStyle === 'barbs') barbs?.setField(f)
    else particles?.updateField(f)
  },
)
watch(() => wind.windStyle, () => showWind())
watch(
  () => wind.enabled,
  (on) => {
    if (!on) {
      showWind()
      return
    }
    // El canvas estaba oculto (tamaño 0): se muestra y se ajusta antes de sembrar las partículas.
    void nextTick(() => {
      particles?.resize()
      if (map && mapStore.controller) wind.setView(mapStore.controller.getBounds())
      showWind()
    })
  },
)
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
    if (map && overlayReady) ensureMarkImages(map)
    set('waypoints', data)
    set('waypoints-labels', data)
  },
)
watch(() => player.track?.id, (id) => id && mapStore.controller?.fitTo(player.points))
watch(() => tracks.drawn, (d) => set('tracks', d))
watch(
  () => [player.split, player.position, player.track] as const,
  () => {
    set('trackplay', playLinesData())
    set('trackplay-vessel', playVesselData())
    const p = player.position
    // El mapa acompaña al buque mientras reproduce (sin animar: la posición cambia unas 15 veces por segundo).
    if (p && map && player.playing && player.follow) map.jumpTo({ center: [p.lon, p.lat] })
  },
)
watch(() => [mapStore.measurePoints, mapStore.measuring] as const, () => set('measure', measureData()))
watch(
  () => [layers.renderLayers, layers.showLabels, layers.imported] as const,
  () => {
    if (map && overlayReady) syncVectorLayers(map, layers.renderLayers, { colors: colors ?? palette(), showLabels: layers.showLabels, imported: layers.imported }, 'rings')
  },
)
watch(() => [mapStore.settings.graticule.show, mapStore.settings.graticule.mode] as const, updateGraticule)
// Tipo de mapa, tema o señales náuticas: otro estilo; las capas propias vuelven en `style.load`.
watch(() => [mapStore.settings.mapType, mapStore.settings.seamarks, theme.resolved.value] as const, applyStyle)
watch(
  () => theme.resolved.value,
  () => {
    particles?.setColors(windColors())
    barbs?.setColors(barbColors())
  },
)
</script>

<template>
  <div class="relative size-full">
    <div ref="container" class="map-canvas size-full" role="region" :aria-label="t('map.title')"></div>
    <!-- Viento: animación encima del mapa (no recibe toques). -->
    <canvas ref="windCanvas" class="pointer-events-none absolute inset-0 size-full" :class="{ hidden: !wind.enabled }" aria-hidden="true"></canvas>
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
