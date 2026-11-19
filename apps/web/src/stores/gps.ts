import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { averageSpeedKn, courseOverGround, pushSample, type PositionSample } from '@gpsm/shared'
import { useWakeLock } from '@/composables/useWakeLock'
import { browserGeoSource, geoPermission, type GeoErrorKind, type GeoSource } from '@/services/geolocation'

/**
 * Estado del GPS:
 * - `inactive`: apagado por el usuario.
 * - `searching`: encendido, esperando el primer fix.
 * - `fixed`: posición vigente.
 * - `stale`: hubo posición pero hace más de `STALE_AFTER_MS` que no llega otra (señal perdida o pestaña en pausa).
 * - `denied` / `unavailable` / `unsupported`: no se puede obtener la posición.
 */
export type GpsStatus = 'inactive' | 'searching' | 'fixed' | 'stale' | GeoErrorKind

export const STALE_AFTER_MS = 15_000

export const useGpsStore = defineStore('gps', () => {
  const active = ref(false)
  const error = ref<GeoErrorKind | null>(null)
  // shallowRef: la lista se reemplaza entera en cada fix (no hace falta reactividad profunda).
  const samples = shallowRef<PositionSample[]>([])
  const now = ref(Date.now())
  let source: GeoSource = browserGeoSource
  let stopWatch: (() => void) | null = null
  let clock: ReturnType<typeof setInterval> | null = null

  // Pantalla encendida mientras el GPS está activo: con la pantalla apagada el navegador suspende la geolocalización.
  const wake = useWakeLock(active)

  const current = computed<PositionSample | null>(() => samples.value[samples.value.length - 1] ?? null)
  /** Velocidad mostrada: promedio de las últimas 10 posiciones (como la app Flutter), en nudos. */
  const speedKn = computed(() => averageSpeedKn(samples.value))
  /** Rumbo sobre el fondo; `null` detenido o sin datos suficientes. */
  const courseDeg = computed(() => courseOverGround(samples.value, speedKn.value))

  const status = computed<GpsStatus>(() => {
    if (error.value) return error.value
    if (!active.value) return 'inactive'
    const c = current.value
    if (!c) return 'searching'
    return now.value - c.t > STALE_AFTER_MS ? 'stale' : 'fixed'
  })
  const hasFix = computed(() => status.value === 'fixed')

  function onSample(s: PositionSample) {
    error.value = null
    samples.value = pushSample(samples.value, s)
    now.value = Date.now()
  }

  function start() {
    if (stopWatch) return
    error.value = null
    active.value = true
    stopWatch = source.watch(onSample, (kind) => {
      error.value = kind
      // Sin permiso o sin API no tiene sentido seguir escuchando; "no disponible" puede ser pasajero.
      if (kind !== 'unavailable') stop(false)
    })
    clock ??= setInterval(() => (now.value = Date.now()), 1000)
  }

  /** Apaga el GPS. `clearError = false` conserva el motivo (p. ej. permiso denegado) para mostrarlo. */
  function stop(clearError = true) {
    stopWatch?.()
    stopWatch = null
    active.value = false
    samples.value = []
    if (clearError) error.value = null
    if (clock) clearInterval(clock)
    clock = null
  }

  /** Cambia la fuente de posiciones (simulador en desarrollo) y reinicia si estaba encendido. */
  function useSource(next: GeoSource) {
    const wasActive = active.value
    stop()
    source = next
    if (wasActive || next !== browserGeoSource) start()
  }

  /** Enciende solo si el permiso ya fue concedido (la app Flutter arrancaba el GPS al abrir la pantalla). */
  async function autoStart() {
    if ((await geoPermission()) === 'granted') start()
  }

  return { active, error, screenOn: wake.held, samples, current, speedKn, courseDeg, status, hasFix, now, start, stop, useSource, autoStart }
})
