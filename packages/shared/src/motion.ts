import { MS_TO_KN, bearingDeg, distanceM, type LatLon } from './geo'

/**
 * Estimación de velocidad y rumbo sobre el fondo (COG) a partir de las posiciones recibidas.
 * En la web `coords.speed` y `coords.heading` pueden venir en `null` (iOS, escritorio, algunos Android):
 * en ese caso se derivan de posiciones sucesivas.
 */

export interface PositionSample extends LatLon {
  /** Instante del fix (ms). */
  t: number
  /** Precisión horizontal (m, radio de 68 %). */
  accuracyM: number
  /** Velocidad informada por el dispositivo (m/s) o `null`. */
  speedMs: number | null
  /** Rumbo informado por el dispositivo (grados) o `null`. */
  headingDeg: number | null
}

/** Muestras que promedia la velocidad (la app Flutter promediaba las últimas 10). */
export const SPEED_AVG_SAMPLES = 10
/** Por debajo de esta velocidad el rumbo informado no es fiable (el GPS da rumbos al azar en el lugar). */
export const MIN_SPEED_FOR_COURSE_KN = 0.5
/** Ventana máxima hacia atrás para derivar el rumbo de dos posiciones. */
export const COURSE_WINDOW_MS = 120_000
/** Desplazamiento mínimo para derivar un rumbo (además de dos veces la precisión). */
export const COURSE_MIN_DISTANCE_M = 15

const valid = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)

/** Base de tiempo mínima para dar por "detenido" a quien no se movió más que el ruido del GPS. */
export const STATIONARY_BASELINE_MS = 5_000

/**
 * Velocidad derivada (m/s) de la muestra `i`: se busca hacia atrás la muestra más reciente que esté más
 * lejos que el ruido del GPS (`2 × precisión`, mínimo 15 m) y se divide distancia por tiempo. Con fixes cada
 * 1 s el avance entre dos fixes seguidos es menor que la precisión, por eso no alcanza con la anterior.
 * Si en la ventana nadie está lo bastante lejos y pasaron al menos 5 s, se considera detenido (0).
 */
function derivedSpeedMs(samples: readonly PositionSample[], i: number): number | null {
  const s = samples[i]!
  const minD = Math.max(COURSE_MIN_DISTANCE_M, 2 * s.accuracyM)
  let oldestDt = 0
  for (let j = i - 1; j >= 0; j--) {
    const p = samples[j]!
    const dt = s.t - p.t
    if (dt > COURSE_WINDOW_MS) break
    if (dt <= 0) continue
    oldestDt = dt
    const d = distanceM(p, s)
    if (d >= minD) return d / (dt / 1000)
  }
  return oldestDt >= STATIONARY_BASELINE_MS ? 0 : null
}

/** Velocidad (m/s) de cada muestra: la informada o, si falta, la derivada (ver `derivedSpeedMs`). */
export function sampleSpeedsMs(samples: readonly PositionSample[]): number[] {
  const out: number[] = []
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!
    const v = valid(s.speedMs) && s.speedMs >= 0 ? s.speedMs : derivedSpeedMs(samples, i)
    if (v != null) out.push(v)
  }
  return out
}

/** Velocidad promedio de las últimas `n` muestras, en nudos (redondeada a 2 decimales). `null` sin datos. */
export function averageSpeedKn(samples: readonly PositionSample[], n = SPEED_AVG_SAMPLES): number | null {
  const speeds = sampleSpeedsMs(samples).slice(-n)
  if (!speeds.length) return null
  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length
  return Math.round(avg * MS_TO_KN * 100) / 100
}

/**
 * Rumbo sobre el fondo (grados) para la última muestra: el informado si hay velocidad suficiente;
 * si no, el de la posición más reciente que esté lo bastante lejos (dentro de la ventana) hacia la actual.
 */
export function courseOverGround(samples: readonly PositionSample[], speedKn: number | null): number | null {
  const last = samples[samples.length - 1]
  if (!last) return null
  if (valid(last.headingDeg) && last.headingDeg >= 0 && (speedKn ?? 0) >= MIN_SPEED_FOR_COURSE_KN) return last.headingDeg
  const minD = Math.max(COURSE_MIN_DISTANCE_M, 2 * last.accuracyM)
  for (let i = samples.length - 2; i >= 0; i--) {
    const s = samples[i]!
    if (last.t - s.t > COURSE_WINDOW_MS) break
    if (distanceM(s, last) >= minD) return bearingDeg(s, last)
  }
  return null
}

/** Agrega una muestra y conserva solo las de la ventana necesaria (sin crecer sin límite). */
export function pushSample(samples: readonly PositionSample[], s: PositionSample, max = 60): PositionSample[] {
  const next = [...samples, s].filter((x) => s.t - x.t <= COURSE_WINDOW_MS)
  return next.slice(-max)
}
