import { useI18n } from 'vue-i18n'
import type { WaypointInput } from '@gpsm/shared'
import { useGpsStore } from '@/stores/gps'
import { useToastStore } from '@/stores/toast'
import { useUiStore, type CapturedPosition } from '@/stores/ui'
import { useWaypointsStore } from '@/stores/waypoints'

/** Velocidad redondeada a 2 decimales y rumbo entero, como guardaba la app Flutter. */
export function waypointFromCapture(c: CapturedPosition, extra: Pick<WaypointInput, 'description' | 'icon' | 'color' | 'visible'>): WaypointInput {
  return {
    ...extra,
    recordedAt: c.sample.t,
    lat: c.sample.lat,
    lon: c.sample.lon,
    speedKn: Math.round((c.speedKn ?? 0) * 100) / 100,
    bearing: c.courseDeg == null ? 0 : Math.floor(c.courseDeg),
  }
}

/** Acciones de registro de la posición actual: "Registro rápido" y "Registrar posición" (con formulario). */
export function usePositionLog() {
  const { t } = useI18n()
  const gps = useGpsStore()
  const ui = useUiStore()
  const waypoints = useWaypointsStore()
  const toast = useToastStore()

  function capture(): CapturedPosition | null {
    const sample = gps.current
    return sample ? { sample, speedKn: gps.speedKn, courseDeg: gps.courseDeg } : null
  }

  /** Igual que en Flutter: salvavidas naranja, visible en el mapa, descripción "Registro rápido". */
  async function quickSave() {
    const c = capture()
    if (!c) return
    const description = t('gps.quickSaveDescription')
    await waypoints.create(waypointFromCapture(c, { description, icon: 'lifeRing', color: 'orange', visible: true }))
    toast.push(t('gps.quickSaved', { name: description }), { tone: 'success' })
  }

  function openSaveForm() {
    const c = capture()
    if (c) ui.openSavePosition(c)
  }

  return { quickSave, openSaveForm }
}
