import { HOUR_MS, type WindGrid } from '@gpsm/shared'

/** Instante (ms UTC) del comienzo de la hora en curso. */
export const currentHourMs = (now: number) => Math.floor(now / HOUR_MS) * HOUR_MS

export interface HourRange {
  min: number
  max: number
}

/**
 * Horas que se pueden elegir: desde la hora actual (lo ya pasado no interesa para navegar) hasta la última del
 * pronóstico. `null` si la grilla no llega hasta ahora (datos viejos, p. ej. del caché sin conexión).
 */
export function selectableRange(grid: Pick<WindGrid, 'startUtcMs' | 'hours'>, now: number): HourRange | null {
  const last = grid.startUtcMs + (grid.hours - 1) * HOUR_MS
  const min = Math.max(grid.startUtcMs, currentHourMs(now))
  return min > last ? null : { min, max: last }
}

export function clampHour(ms: number, range: HourRange): number {
  return Math.min(range.max, Math.max(range.min, Math.round(ms / HOUR_MS) * HOUR_MS))
}

/** Día local `AAAA-MM-DD` de un instante. */
export function localDayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface DayChip {
  key: string
  /** Primera hora elegible de ese día. */
  firstMs: number
}

/** Días locales que cubre el rango, con su primera hora elegible (para saltar de un día a otro). */
export function daysInRange(range: HourRange): DayChip[] {
  const out: DayChip[] = []
  for (let ms = range.min; ms <= range.max; ms += HOUR_MS) {
    const key = localDayKey(ms)
    if (out[out.length - 1]?.key !== key) out.push({ key, firstMs: ms })
  }
  return out
}

/** Mismo horario local en otro día, ajustado al rango (al tocar un día se conserva la hora del día, si se puede). */
export function sameLocalTimeOnDay(ms: number, day: DayChip, range: HourRange): number {
  const src = new Date(ms)
  const [y, m, d] = day.key.split('-').map(Number)
  const target = new Date(y!, m! - 1, d!, src.getHours(), 0, 0, 0).getTime()
  return clampHour(target, range)
}
