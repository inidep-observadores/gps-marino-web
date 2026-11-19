import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { polylineNm, type Bounds, type LatLon } from '@gpsm/shared'
import type { MapType } from '@/components/map/mapStyles'
import { readJson, writeJson } from '@/composables/storage'
import { useDatabaseStore } from './database'

/** Ajustes del mapa que viajan con la cuenta (tabla `settings`, clave `map.settings`). Valores por defecto de Flutter. */
export interface MapSettings {
  mapType: MapType
  showVessel: boolean
  rings: { show: boolean; count: number; spacingNm: number }
  cog: { show: boolean; minutes: number }
  /** Capa de señales náuticas de OpenSeaMap (nueva respecto de Flutter). */
  seamarks: boolean
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  mapType: 'standard',
  showVessel: true,
  rings: { show: false, count: 3, spacingNm: 1 },
  cog: { show: false, minutes: 10 },
  seamarks: false,
}

const SETTINGS_KEY = 'map.settings'
/** Cámara: propia de este dispositivo (localStorage), no se sincroniza. */
const CAMERA_KEY = 'gpsm.map.camera.v1'

export interface Camera extends LatLon {
  zoom: number
}
/** Mar Argentino, a escala de plataforma, si nunca se abrió el mapa. */
export const DEFAULT_CAMERA: Camera = { lat: -42, lon: -61, zoom: 4.5 }

/** Elemento tocado en el mapa: una ubicación guardada o un elemento (línea o punto) de una capa. */
export type SelectedFeature = { kind: 'waypoint'; id: string } | { kind: 'feature'; sourceId: string; featureId: string }

/** Acciones sobre la instancia de MapLibre, que registra `MapCanvas` al montarse. */
export interface MapController {
  zoomBy(delta: number): void
  flyTo(p: LatLon, zoom?: number): void
  /** Rectángulo visible ahora. */
  getBounds(): Bounds
}

export const useMapStore = defineStore('map', () => {
  const database = useDatabaseStore()
  const settings = ref<MapSettings>(structuredClone(DEFAULT_MAP_SETTINGS))
  const camera = ref<Camera>({ ...DEFAULT_CAMERA, ...readJson<Camera>(CAMERA_KEY) })
  /** Centro actual del mapa = posición del cursor. */
  const center = ref<LatLon>({ lat: camera.value.lat, lon: camera.value.lon })
  const zoom = ref(camera.value.zoom)
  const following = ref(false)
  const cursorVisible = ref(false)
  const measuring = ref(false)
  const measurePoints = ref<LatLon[]>([])
  const selected = ref<SelectedFeature | null>(null)
  const controller = shallowRef<MapController | null>(null)

  async function load() {
    const saved = await (await database.ready()).settings.get<Partial<MapSettings>>(SETTINGS_KEY, {})
    settings.value = {
      ...DEFAULT_MAP_SETTINGS,
      ...saved,
      rings: { ...DEFAULT_MAP_SETTINGS.rings, ...saved.rings },
      cog: { ...DEFAULT_MAP_SETTINGS.cog, ...saved.cog },
    }
  }

  async function update(patch: Partial<MapSettings>) {
    settings.value = { ...settings.value, ...patch }
    await (await database.ready()).settings.set(SETTINGS_KEY, settings.value)
  }

  /** Lo llama el mapa al terminar cada movimiento: recuerda la cámara para la próxima vez. */
  function saveCamera(c: Camera) {
    camera.value = c
    writeJson(CAMERA_KEY, c)
  }

  function setCursor(visible: boolean) {
    cursorVisible.value = visible
    // Como en Flutter: la medición usa el cursor, al ocultarlo se termina.
    if (!visible) stopMeasuring()
  }

  function startMeasuring() {
    cursorVisible.value = true
    measuring.value = true
    measurePoints.value = []
  }
  function stopMeasuring() {
    measuring.value = false
    measurePoints.value = []
  }
  /** Marca el punto bajo el cursor (centro del mapa). */
  const markPoint = () => (measurePoints.value = [...measurePoints.value, { ...center.value }])
  const undoPoint = () => (measurePoints.value = measurePoints.value.slice(0, -1))
  /** Distancia medida: tramos marcados + tramo dinámico hasta el cursor. */
  const measureNm = computed(() =>
    measurePoints.value.length ? polylineNm([...measurePoints.value, center.value]) : 0,
  )

  return {
    settings,
    camera,
    center,
    zoom,
    following,
    cursorVisible,
    measuring,
    measurePoints,
    measureNm,
    selected,
    controller,
    load,
    update,
    saveCamera,
    setCursor,
    startMeasuring,
    stopMeasuring,
    markPoint,
    undoPoint,
  }
})
