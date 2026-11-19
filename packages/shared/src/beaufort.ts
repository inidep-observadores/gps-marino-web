/**
 * Escala de Beaufort (fuerza 0–12, tabla de la OMM). Pura: sin Vue ni DOM.
 * Las velocidades son nudos enteros (el límite inferior de cada fuerza); las alturas de ola son las "probables" y las
 * "máximas" de la tabla clásica, en metros, para mar abierto.
 */
export interface BeaufortLevel {
  force: number
  /** Velocidad mínima del viento (nudos) para esta fuerza. */
  minKn: number
  /** Velocidad máxima (nudos); `null` en la fuerza 12 (64 nudos o más). */
  maxKn: number | null
  /** Altura de ola probable (m). */
  waveM: number
  /** Altura máxima de ola (m); `null` en la fuerza 12 (la tabla dice "14 o más"). */
  waveMaxM: number | null
}

export const BEAUFORT_SCALE: readonly BeaufortLevel[] = [
  { force: 0, minKn: 0, maxKn: 0, waveM: 0, waveMaxM: 0 },
  { force: 1, minKn: 1, maxKn: 3, waveM: 0.1, waveMaxM: 0.1 },
  { force: 2, minKn: 4, maxKn: 6, waveM: 0.2, waveMaxM: 0.3 },
  { force: 3, minKn: 7, maxKn: 10, waveM: 0.6, waveMaxM: 1 },
  { force: 4, minKn: 11, maxKn: 16, waveM: 1, waveMaxM: 1.5 },
  { force: 5, minKn: 17, maxKn: 21, waveM: 2, waveMaxM: 2.5 },
  { force: 6, minKn: 22, maxKn: 27, waveM: 3, waveMaxM: 4 },
  { force: 7, minKn: 28, maxKn: 33, waveM: 4, waveMaxM: 5.5 },
  { force: 8, minKn: 34, maxKn: 40, waveM: 5.5, waveMaxM: 7.5 },
  { force: 9, minKn: 41, maxKn: 47, waveM: 7, waveMaxM: 10 },
  { force: 10, minKn: 48, maxKn: 55, waveM: 9, waveMaxM: 12.5 },
  { force: 11, minKn: 56, maxKn: 63, waveM: 11.5, waveMaxM: 16 },
  { force: 12, minKn: 64, maxKn: null, waveM: 14, waveMaxM: null },
]

/** Fuerza Beaufort (0–12) de una velocidad en nudos. Valores negativos o inválidos cuentan como calma. */
export function beaufortFromKnots(kn: number): number {
  if (!Number.isFinite(kn)) return 0
  let force = 0
  for (const l of BEAUFORT_SCALE) if (kn >= l.minKn) force = l.force
  return force
}

/** Rango del nivel en km/h (de las velocidades en nudos de la tabla); `max` es `null` en la fuerza 12. */
export function beaufortKmh(level: BeaufortLevel): { min: number; max: number | null } {
  return { min: Math.round(level.minKn * 1.852), max: level.maxKn == null ? null : Math.round(level.maxKn * 1.852) }
}

/** Tono de color de una fuerza: coincide con las bandas del viento del mapa (verde < 10 kn, ámbar hasta 21, naranja hasta 33, rojo más). */
export type BeaufortTone = 'go' | 'caution' | 'orange' | 'stop'
export function beaufortTone(force: number): BeaufortTone {
  if (force <= 3) return 'go'
  if (force <= 5) return 'caution'
  if (force <= 7) return 'orange'
  return 'stop'
}
