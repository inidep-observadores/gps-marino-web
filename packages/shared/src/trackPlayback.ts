import { bearingDeg, distanceM, METERS_PER_NM } from './geo'
import type { TrackPoint } from './track'

/**
 * Reproducción de una derrota: dado un instante, dónde estaba el buque, con qué rumbo y qué tramo ya recorrió.
 * Puro y sin Vue: lo usa el reproductor del mapa.
 */

/** Velocidades de reproducción (veces el tiempo real). Las altas sirven para derrotas de días. */
export const PLAYBACK_SPEEDS = [1, 2, 4, 10, 60, 300, 1800, 7200, 21600, 86400] as const

/** Velocidad inicial: la más chica que recorre toda la derrota en unos 2 minutos (nunca menos de 4×). */
export function defaultPlaybackSpeed(durationMs: number): number {
  const want = durationMs / 120_000
  return PLAYBACK_SPEEDS.find((s) => s >= 4 && s >= want) ?? PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1]!
}

export interface PlaybackPosition {
  lat: number
  lon: number
  /** Rumbo (°): el registrado en la derrota o, si no lo trae, el del tramo en curso. */
  courseDeg: number
  /** Índice del último punto ya alcanzado. */
  index: number
  /** Distancia recorrida hasta acá (Nm). */
  distanceNm: number
  /** Velocidad de la derrota en este tramo (kn): la registrada, o la calculada entre los dos puntos. */
  speedKn: number | null
}

/** Último índice `i` con `points[i].t <= t` (0 si es anterior al inicio). */
export function indexAt(points: readonly TrackPoint[], t: number): number {
  let lo = 0
  let hi = points.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (points[mid]!.t <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Longitud (con corrección del cruce de ±180°) entre dos puntos, para interpolar sin saltos. */
const lonDelta = (a: number, b: number) => {
  const d = b - a
  return d > 180 ? d - 360 : d < -180 ? d + 360 : d
}

/** Distancia acumulada (Nm) hasta cada punto: permite saber cuánto se recorrió en cualquier instante. */
export function cumulativeNm(points: readonly TrackPoint[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) out.push(out[i - 1]! + distanceM(points[i - 1]!, points[i]!) / METERS_PER_NM)
  return out
}

/**
 * Rumbo en el punto `i`: el del tramo hacia el siguiente punto distinto; si el buque está parado (puntos repetidos) se
 * usa el rumbo registrado o, en su defecto, el último rumbo que hubo.
 */
function courseAt(points: readonly TrackPoint[], i: number): number {
  for (let j = i; j < points.length - 1; j++) {
    const a = points[j]!
    const b = points[j + 1]!
    if (distanceM(a, b) > 5) return bearingDeg(a, b)
  }
  for (let j = i; j >= 1; j--) {
    const a = points[j - 1]!
    const b = points[j]!
    if (distanceM(a, b) > 5) return bearingDeg(a, b)
  }
  return points[i]?.courseDeg ?? 0
}

/** Posición del buque en el instante `t` (interpolada entre los dos puntos vecinos). */
export function positionAt(points: readonly TrackPoint[], cum: readonly number[], t: number): PlaybackPosition | null {
  if (!points.length) return null
  const last = points.length - 1
  const i = indexAt(points, t)
  const a = points[i]!
  const b = points[Math.min(i + 1, last)]!
  const span = b.t - a.t
  const f = i >= last || span <= 0 ? 0 : Math.min(1, Math.max(0, (t - a.t) / span))
  const lat = a.lat + (b.lat - a.lat) * f
  const lon = ((a.lon + lonDelta(a.lon, b.lon) * f + 540) % 360) - 180
  const segNm = distanceM(a, b) / METERS_PER_NM
  const computed = span > 0 ? segNm / (span / 3_600_000) : null
  return {
    lat,
    lon,
    courseDeg: a.courseDeg ?? courseAt(points, i),
    index: i,
    distanceNm: (cum[i] ?? 0) + segNm * f,
    speedKn: a.speedKn ?? computed,
  }
}

export interface PlaybackSplit {
  /** Tramo ya recorrido: del inicio hasta el buque (coordenadas [lon, lat]). */
  done: [number, number][]
  /** Tramo que falta: del buque hasta el final. */
  rest: [number, number][]
}

/** Parte la línea en lo recorrido y lo que falta, con el buque como punto en común. */
export function splitAt(points: readonly TrackPoint[], pos: PlaybackPosition): PlaybackSplit {
  const here: [number, number] = [pos.lon, pos.lat]
  const upto = points.slice(0, pos.index + 1).map((p) => [p.lon, p.lat] as [number, number])
  const from = points.slice(pos.index + 1).map((p) => [p.lon, p.lat] as [number, number])
  return { done: [...upto, here], rest: [here, ...from] }
}
