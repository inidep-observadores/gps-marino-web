import type { PositionSample } from '@gpsm/shared'

/** Motivo por el que no hay posición. */
export type GeoErrorKind = 'denied' | 'unavailable' | 'unsupported'

/** Fuente de posiciones: el GPS del navegador o, en desarrollo, un simulador. */
export interface GeoSource {
  /** Empieza a recibir posiciones; devuelve la función para detener. */
  watch(onSample: (s: PositionSample) => void, onError: (kind: GeoErrorKind, message: string) => void): () => void
}

/** Convierte una lectura de la API de geolocalización a la muestra del dominio (null si el dato no viene). */
export function toSample(pos: GeolocationPosition): PositionSample {
  const c = pos.coords
  const num = (v: number | null) => (v != null && Number.isFinite(v) ? v : null)
  return {
    lat: c.latitude,
    lon: c.longitude,
    accuracyM: c.accuracy,
    speedMs: num(c.speed),
    headingDeg: num(c.heading),
    t: pos.timestamp || Date.now(),
  }
}

/**
 * GPS del dispositivo (`watchPosition` con alta precisión). Sin `timeout`: en altamar el primer fix puede
 * tardar; el estado "buscando señal" lo muestra la interfaz. `maximumAge: 0` evita posiciones viejas en caché.
 */
export const browserGeoSource: GeoSource = {
  watch(onSample, onError) {
    if (!('geolocation' in navigator)) {
      onError('unsupported', 'Geolocation API not available')
      return () => {}
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => onSample(toSample(pos)),
      (err) => {
        // TIMEOUT no corta el seguimiento: el navegador sigue intentando.
        if (err.code === err.PERMISSION_DENIED) onError('denied', err.message)
        else if (err.code === err.POSITION_UNAVAILABLE) onError('unavailable', err.message)
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    return () => navigator.geolocation.clearWatch(id)
  },
}

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/** Estado del permiso de ubicación, sin pedirlo (Permissions API; `unknown` si el navegador no la tiene). */
export async function geoPermission(): Promise<GeoPermission> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}
