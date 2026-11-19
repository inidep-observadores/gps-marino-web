import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { PositionSample } from '@gpsm/shared'

export type SheetId = 'settings' | 'savePosition' | 'destination'
export type ViewId = 'gps' | 'waypoints' | 'map'

/** Hash de cada vista: permite volver con el botón "atrás" y abrir una vista directo desde la PWA. */
export const VIEW_HASH: Record<ViewId, string> = {
  gps: '#/',
  waypoints: '#/ubicaciones',
  map: '#/mapa',
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

/** Estado efímero de la interfaz (no se persiste): vista actual, hoja modal abierta y sus datos. */
export const useUiStore = defineStore('ui', () => {
  const sheet = ref<SheetId | null>(null)
  const view = ref<ViewId>(viewFromHash(window.location.hash))
  const captured = shallowRef<CapturedPosition | null>(null)

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

  function openSavePosition(c: CapturedPosition) {
    captured.value = c
    open('savePosition')
  }

  return { sheet, view, captured, open, close, go, openSavePosition }
})
