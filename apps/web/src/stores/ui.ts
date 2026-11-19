import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { ParsedBackup, PositionSample, WaypointInput } from '@gpsm/shared'

export type SheetId = 'settings' | 'waypoint' | 'destination' | 'export' | 'restore' | 'mapSettings' | 'layers' | 'pointForecast'
export type ViewId = 'gps' | 'waypoints' | 'map' | 'converter'

/** Hash de cada vista: permite volver con el botón "atrás" y abrir una vista directo desde la PWA. */
export const VIEW_HASH: Record<ViewId, string> = {
  gps: '#/',
  waypoints: '#/ubicaciones',
  map: '#/mapa',
  converter: '#/conversor',
}

export function viewFromHash(hash: string): ViewId {
  const match = (Object.keys(VIEW_HASH) as ViewId[]).find((v) => VIEW_HASH[v] === hash)
  return match ?? 'gps'
}

/** Posición capturada al pedir "Registrar posición" (con la velocidad y el rumbo de ese momento). */
export interface CapturedPosition {
  sample: PositionSample
  speedKn: number | null
  courseDeg: number | null
}

/** Qué edita la hoja `waypoint`: una ubicación existente o una nueva con valores iniciales (GPS o cursor del mapa). */
export type WaypointEditTarget = { kind: 'edit'; id: string } | { kind: 'new'; input: WaypointInput; /** Formulario vacío para escribir todo a mano. */ blank?: boolean }

/** Estado efímero de la interfaz (no se persiste): vista actual, hoja modal abierta y sus datos. */
export const useUiStore = defineStore('ui', () => {
  const sheet = ref<SheetId | null>(null)
  const view = ref<ViewId>(viewFromHash(window.location.hash))
  const editing = shallowRef<WaypointEditTarget | null>(null)
  /** Ids a exportar (vacío = todas). `backup` abre la hoja con la copia de seguridad elegida. */
  const exportRequest = shallowRef<{ ids: string[]; backup: boolean }>({ ids: [], backup: false })
  /** Copia leída, esperando que el usuario elija combinar o reemplazar. */
  /** Punto cuyo pronóstico muestra la hoja `pointForecast`. */
  const forecastPoint = shallowRef<{ lat: number; lon: number } | null>(null)
  /** De dónde sale el punto del pronóstico: el cursor del mapa o la posición del GPS. */
  const forecastSource = ref<'cursor' | 'gps'>('cursor')
  const pendingRestore = shallowRef<{ fileName: string; backup: ParsedBackup } | null>(null)

  window.addEventListener('hashchange', () => {
    view.value = viewFromHash(window.location.hash)
    window.scrollTo({ top: 0 })
  })

  const open = (id: SheetId) => {
    sheet.value = id
  }
  const close = () => {
    sheet.value = null
  }

  function go(v: ViewId) {
    if (v === view.value) return
    window.location.hash = VIEW_HASH[v]
  }

  function openNewWaypoint(input: WaypointInput) {
    editing.value = { kind: 'new', input }
    open('waypoint')
  }

  /** "Nueva ubicación": formulario en blanco, para cargar una posición a mano (de una bitácora, una carta...). */
  function openBlankWaypoint() {
    editing.value = {
      kind: 'new',
      blank: true,
      input: { description: '', recordedAt: Date.now(), lat: 0, lon: 0, speedKn: 0, bearing: 0, icon: 'locationDot', color: 'blue', visible: true },
    }
    open('waypoint')
  }

  function openWaypoint(id: string) {
    editing.value = { kind: 'edit', id }
    open('waypoint')
  }

  function openExport(ids: string[] = [], backup = false) {
    exportRequest.value = { ids, backup }
    open('export')
  }

  function openPointForecast(p: { lat: number; lon: number }, source: 'cursor' | 'gps' = 'cursor') {
    forecastPoint.value = p
    forecastSource.value = source
    open('pointForecast')
  }

  function openRestore(fileName: string, backup: ParsedBackup) {
    pendingRestore.value = { fileName, backup }
    open('restore')
  }

  return { sheet, view, editing, exportRequest, pendingRestore, forecastPoint, forecastSource, open, close, go, openNewWaypoint, openBlankWaypoint, openWaypoint, openExport, openRestore, openPointForecast }
})
