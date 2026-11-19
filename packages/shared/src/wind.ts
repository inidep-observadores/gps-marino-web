import { MS_TO_KN, normalizeDeg, type LatLon } from './geo'
import type { Bounds } from './tiles'

/**
 * Campo de viento sobre una grilla de puntos (mapa de viento), portado de `windField.ts` de Drone Forecast.
 * Sin dependencias del mapa ni de la red. Fila 0 = sur, columna 0 = oeste. Velocidades en m/s; la dirección es de
 * DÓNDE viene el viento (0 = norte).
 */

export interface GridSpec extends Bounds {
  cols: number
  rows: number
}

/** Puntos por grilla: cada uno cuenta como un pedido para el límite diario de Open-Meteo. */
export const GRID_TARGET_POINTS = 48
const MIN_SIDE = 3
const MAX_SIDE = 10
/** Cuánto se agranda la grilla respecto de lo visible, para mover un poco el mapa sin volver a pedir. */
const GRID_PAD = 0.3

/** Grilla que cubre `view` (con margen), con ~48 puntos repartidos según la proporción de la pantalla. */
export function gridSpecFor(view: Bounds): GridSpec {
  const w = view.east - view.west
  const h = view.north - view.south
  const aspect = w / Math.max(h, 1e-6)
  const cols = Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(Math.sqrt(GRID_TARGET_POINTS * aspect))))
  const rows = Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(GRID_TARGET_POINTS / cols)))
  return {
    west: view.west - w * GRID_PAD,
    east: view.east + w * GRID_PAD,
    south: Math.max(-85, view.south - h * GRID_PAD),
    north: Math.min(85, view.north + h * GRID_PAD),
    cols,
    rows,
  }
}

/** Puntos en orden de fila (sur → norte) y, dentro de la fila, de oeste a este. */
export function gridPoints(spec: GridSpec): LatLon[] {
  const out: LatLon[] = []
  for (let j = 0; j < spec.rows; j++)
    for (let i = 0; i < spec.cols; i++)
      out.push({
        lat: spec.south + ((spec.north - spec.south) * j) / (spec.rows - 1),
        lon: spec.west + ((spec.east - spec.west) * i) / (spec.cols - 1),
      })
  return out
}

/** ¿Hay que pedir otra grilla? Sí si lo visible se sale de ella o si se acercó tanto que quedó muy espaciada. */
export function needsNewGrid(spec: GridSpec | null, view: Bounds): boolean {
  if (!spec) return true
  const outside = view.west < spec.west || view.east > spec.east || view.south < spec.south || view.north > spec.north
  const tooCoarse = (spec.east - spec.west) / Math.max(view.east - view.west, 1e-6) > 3.2
  return outside || tooCoarse
}

/** Componentes (u hacia el este, v hacia el norte) de un viento que viene de `directionFrom` grados. */
export function windVector(speed: number, directionFrom: number): { u: number; v: number } {
  const r = (directionFrom * Math.PI) / 180
  return { u: -speed * Math.sin(r), v: -speed * Math.cos(r) }
}

/** Pronóstico horario del viento en cada punto de la grilla (un arreglo por punto, en el orden de `gridPoints`). */
export interface WindGrid {
  spec: GridSpec
  /** Instante UTC (ms) de la primera hora. */
  startUtcMs: number
  /** Cantidad de horas de datos. */
  hours: number
  speed: Float32Array[]
  direction: Float32Array[]
  /** Cuándo se obtuvo el pronóstico (ms); puede ser anterior si salió del caché sin conexión. */
  fetchedAt: number
}

export interface WindField {
  spec: GridSpec
  u: Float32Array
  v: Float32Array
}

export const HOUR_MS = 3_600_000

/** Campo de viento de una hora (instante UTC). `null` si esa hora no está en los datos. */
export function fieldAt(grid: WindGrid, utcMs: number): WindField | null {
  const index = Math.round((utcMs - grid.startUtcMs) / HOUR_MS)
  const n = grid.spec.cols * grid.spec.rows
  if (index < 0 || index >= grid.hours || grid.speed.length !== n) return null
  const u = new Float32Array(n)
  const v = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    const w = windVector(grid.speed[p]![index]!, grid.direction[p]![index]!)
    u[p] = w.u
    v[p] = w.v
  }
  return { spec: grid.spec, u, v }
}

/** Viento en un punto cualquiera por interpolación bilineal. `null` fuera de la grilla. */
export function sampleField(field: WindField, lon: number, lat: number): { u: number; v: number } | null {
  const { spec } = field
  const fx = ((lon - spec.west) / (spec.east - spec.west)) * (spec.cols - 1)
  const fy = ((lat - spec.south) / (spec.north - spec.south)) * (spec.rows - 1)
  if (!(fx >= 0 && fy >= 0 && fx <= spec.cols - 1 && fy <= spec.rows - 1)) return null
  const x0 = Math.min(Math.floor(fx), spec.cols - 2)
  const y0 = Math.min(Math.floor(fy), spec.rows - 2)
  const tx = fx - x0
  const ty = fy - y0
  const at = (arr: Float32Array) => {
    const i = y0 * spec.cols + x0
    const a = arr[i]! * (1 - tx) + arr[i + 1]! * tx
    const b = arr[i + spec.cols]! * (1 - tx) + arr[i + spec.cols + 1]! * tx
    return a * (1 - ty) + b * ty
  }
  return { u: at(field.u), v: at(field.v) }
}

/** Velocidad (m/s) y dirección de la que viene (grados) a partir de las componentes. */
export function windFromUV(u: number, v: number): { speed: number; directionFrom: number } {
  return { speed: Math.hypot(u, v), directionFrom: normalizeDeg((Math.atan2(-u, -v) * 180) / Math.PI) }
}

// ---------------------------------------------------------------------------------------------------------------
// Colores por intensidad (nudos), pensados para la pesca

/** Bandas de intensidad. `calm`: sin problema; `fresh`: viento fresco; `strong`: fuerte; `gale`: temporal. */
export type WindBand = 'calm' | 'fresh' | 'strong' | 'gale'
/** Límites superiores en nudos (aprox. escala Beaufort 3-4 / 5-6 / 7). */
export const WIND_BAND_LIMITS_KN = { calm: 10, fresh: 21, strong: 33 } as const

export function windBand(speedMs: number): WindBand {
  const kn = speedMs * MS_TO_KN
  if (kn < WIND_BAND_LIMITS_KN.calm) return 'calm'
  if (kn < WIND_BAND_LIMITS_KN.fresh) return 'fresh'
  if (kn < WIND_BAND_LIMITS_KN.strong) return 'strong'
  return 'gale'
}

const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
/** Rosa de 16 vientos (letras en español: O = oeste). `west` permite usar W en inglés. */
export function cardinal16(deg: number, west = 'O'): string {
  const name = CARDINALS[Math.round(normalizeDeg(deg) / 22.5) % 16]!
  return west === 'O' ? name : name.replace(/O/g, west)
}

// ---------------------------------------------------------------------------------------------------------------
// Pedido a Open-Meteo

export const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

/**
 * URL de UN pedido con todos los puntos de la grilla y todas las horas (cambiar la hora después no usa la red).
 * Va en UTC para indexar por instante; se pide un día de más porque el día UTC y el local pueden no coincidir.
 */
export function buildWindGridUrl(spec: GridSpec, days: number, baseUrl = OPEN_METEO_FORECAST_URL): string {
  const points = gridPoints(spec)
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(3)).join(','),
    longitude: points.map((p) => p.lon.toFixed(3)).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    timezone: 'GMT',
    forecast_days: String(Math.min(16, days + 1)),
  })
  return `${baseUrl}?${params.toString()}`
}

interface WindResponse {
  hourly: { time: string[]; wind_speed_10m: Array<number | null>; wind_direction_10m: Array<number | null> }
}

/** Respuesta de Open-Meteo (un objeto por punto, o uno solo) → grilla. Lanza si faltan puntos. */
export function parseWindGrid(raw: WindResponse | WindResponse[], spec: GridSpec, fetchedAt = Date.now()): WindGrid {
  const list = Array.isArray(raw) ? raw : [raw]
  if (list.length !== spec.cols * spec.rows) throw new Error('wind-grid-incomplete')
  const clean = (a: Array<number | null>) => Float32Array.from(a, (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0))
  const hours = Math.min(...list.map((r) => r.hourly.time.length))
  return {
    spec,
    startUtcMs: Date.parse(`${list[0]!.hourly.time[0]}Z`),
    hours,
    speed: list.map((r) => clean(r.hourly.wind_speed_10m).subarray(0, hours)),
    direction: list.map((r) => clean(r.hourly.wind_direction_10m).subarray(0, hours)),
    fetchedAt,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Escala Beaufort

/** Límites inferiores (nudos) de cada fuerza Beaufort 0–12 (escala de la OMM). */
const BEAUFORT_MIN_KN = [0, 1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64]

/** Fuerza Beaufort (0–12) de una velocidad en m/s. */
export function beaufortForce(speedMs: number): number {
  const kn = Math.max(0, speedMs * MS_TO_KN)
  let f = 0
  for (let i = 0; i < BEAUFORT_MIN_KN.length; i++) if (kn >= BEAUFORT_MIN_KN[i]!) f = i
  return f
}
