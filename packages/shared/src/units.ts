import { fromDegMin, toDegMin } from './format'

/**
 * Conversión de unidades de uso náutico. Puro (sin Vue ni DOM).
 * Cada grupo es lineal: una unidad base y, por cada unidad, cuántas unidades base vale 1 de ella.
 */
export interface LinearUnit {
  id: string
  /** Unidades base que vale 1 de esta unidad. */
  factor: number
}

export type ConversionGroupId = 'depth' | 'distanceLong' | 'distanceShort' | 'speed' | 'pressure'

/** 1 milla náutica = 1852 m; 1 cable = 0,1 Mn = 185,2 m; braza náutica (fathom) = 1,8288 m; 1 mmHg = 1,33322387415 hPa. */
export const FATHOM_M = 1.8288
export const CABLE_M = 185.2
export const MMHG_HPA = 1.33322387415

export const CONVERSION_GROUPS: Record<ConversionGroupId, LinearUnit[]> = {
  /** Profundidad: base metros. */
  depth: [
    { id: 'm', factor: 1 },
    { id: 'fathom', factor: FATHOM_M },
  ],
  /** Distancia larga: base metros. */
  distanceLong: [
    { id: 'nm', factor: 1852 },
    { id: 'km', factor: 1000 },
  ],
  /** Distancia corta: base metros. */
  distanceShort: [
    { id: 'm', factor: 1 },
    { id: 'cable', factor: CABLE_M },
  ],
  /** Velocidad: base m/s. 1 nudo = 1852 m / 3600 s. */
  speed: [
    { id: 'kn', factor: 1852 / 3600 },
    { id: 'kmh', factor: 1000 / 3600 },
    { id: 'ms', factor: 1 },
  ],
  /** Presión: base hPa. */
  pressure: [
    { id: 'hpa', factor: 1 },
    { id: 'mmhg', factor: MMHG_HPA },
  ],
}

/** Convierte un valor de la unidad `fromId` a todas las del grupo (incluida ella misma). */
export function convertAll(group: ConversionGroupId, fromId: string, value: number): Record<string, number> {
  const units = CONVERSION_GROUPS[group]
  const from = units.find((u) => u.id === fromId)
  if (!from) throw new Error(`Unidad desconocida: ${group}/${fromId}`)
  const base = value * from.factor
  return Object.fromEntries(units.map((u) => [u.id, base / u.factor]))
}

/**
 * Número escrito por una persona: acepta coma o punto decimal, espacios y signo menos. `null` si no es un número
 * (vacío, texto, varios separadores...).
 */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(',', '.')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

// ---------------------------------------------------------------------------------------------------------------
// Coordenadas: grados decimales ⇄ grados y minutos decimales ⇄ grados, minutos y segundos

export interface DegMinSec {
  deg: number
  min: number
  sec: number
  /** `true` para sur u oeste. */
  negative: boolean
}

/** Grados decimales → grados, minutos y segundos (redondeados a `decimals`), con acarreo correcto (59,9996″ → 1′). */
export function toDegMinSec(value: number, decimals = 2): DegMinSec {
  const negative = value < 0
  const scale = 10 ** decimals
  const totalSec = Math.round(Math.abs(value) * 3600 * scale)
  const perDeg = 3600 * scale
  const perMin = 60 * scale
  const deg = Math.floor(totalSec / perDeg)
  const rest = totalSec % perDeg
  return { deg, min: Math.floor(rest / perMin), sec: (rest % perMin) / scale, negative }
}

export function fromDegMinSec(deg: number, min: number, sec: number, negative: boolean): number {
  const v = Math.abs(deg) + Math.abs(min) / 60 + Math.abs(sec) / 3600
  return negative ? -v : v
}

export type CoordAxis = 'lat' | 'lon'
export const COORD_LIMIT: Record<CoordAxis, number> = { lat: 90, lon: 180 }

/** `true` si el valor (con signo) cabe en el eje: latitud ±90°, longitud ±180°. */
export const coordInRange = (axis: CoordAxis, value: number) => Math.abs(value) <= COORD_LIMIT[axis] + 1e-12

/** Las tres formas de escribir una coordenada, como números sin signo (el hemisferio va aparte). */
export interface CoordForms {
  negative: boolean
  decimal: number
  dm: { deg: number; min: number }
  dms: { deg: number; min: number; sec: number }
}

export function coordForms(value: number): CoordForms {
  const dm = toDegMin(value, 6)
  const dms = toDegMinSec(value, 4)
  return { negative: value < 0, decimal: Math.abs(value), dm: { deg: dm.deg, min: dm.min }, dms: { deg: dms.deg, min: dms.min, sec: dms.sec } }
}

export const coordFromDecimal = (decimal: number, negative: boolean) => (negative ? -Math.abs(decimal) : Math.abs(decimal))
export const coordFromDm = (deg: number, min: number, negative: boolean) => fromDegMin(deg, min, negative)
export const coordFromDms = (deg: number, min: number, sec: number, negative: boolean) => fromDegMinSec(deg, min, sec, negative)
