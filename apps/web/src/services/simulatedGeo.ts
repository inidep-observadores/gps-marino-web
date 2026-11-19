import { MS_TO_KN, destinationPoint, type LatLon } from '@gpsm/shared'
import type { GeoSource } from './geolocation'

export interface SimulationOptions extends LatLon {
  speedKn: number
  courseDeg: number
  /** Intervalo entre posiciones (ms). */
  intervalMs?: number
  /** Si es `false`, las muestras llegan sin velocidad ni rumbo (como en iOS/escritorio) y la app los deriva. */
  reportMotion?: boolean
  accuracyM?: number
}

export interface SimulatedSource extends GeoSource {
  /** Cambia rumbo o velocidad durante la simulación. */
  set(changes: Partial<Pick<SimulationOptions, 'speedKn' | 'courseDeg' | 'lat' | 'lon'>>): void
  readonly position: LatLon
}

/**
 * Buque simulado que navega a rumbo y velocidad constantes. Solo para desarrollo y pruebas en el
 * navegador integrado (no hay GPS real ahí): `__gpsm.simulate({ lat, lon, speedKn, courseDeg })`.
 */
export function createSimulatedSource(opts: SimulationOptions): SimulatedSource {
  const state = { ...opts, intervalMs: opts.intervalMs ?? 1000, reportMotion: opts.reportMotion ?? true, accuracyM: opts.accuracyM ?? 5 }
  return {
    get position() {
      return { lat: state.lat, lon: state.lon }
    },
    set(changes) {
      Object.assign(state, changes)
    },
    watch(onSample) {
      const tick = () => {
        const next = destinationPoint(state, state.courseDeg, (state.speedKn * state.intervalMs) / 3_600_000)
        state.lat = next.lat
        state.lon = next.lon
        onSample({
          lat: state.lat,
          lon: state.lon,
          t: Date.now(),
          accuracyM: state.accuracyM,
          speedMs: state.reportMotion ? state.speedKn / MS_TO_KN : null,
          headingDeg: state.reportMotion ? state.courseDeg : null,
        })
      }
      tick()
      const id = setInterval(tick, state.intervalMs)
      return () => clearInterval(id)
    },
  }
}
