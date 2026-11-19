import type { Waypoint } from './domain'
import type { MarkIcon } from './marks'
import { matchesSearch } from './text'

/** Criterios de orden de la lista de ubicaciones (los mismos de la app Flutter). */
export const WAYPOINT_ORDERS = ['date', 'name', 'icon'] as const
export type WaypointOrder = (typeof WAYPOINT_ORDERS)[number]

export interface WaypointListOptions {
  order: WaypointOrder
  descending: boolean
  /** Texto de búsqueda (sin acentos ni mayúsculas) sobre la descripción. */
  query?: string
  /** Nombre visible de cada ícono: ordenar "por ícono" es alfabético por su nombre, como en Flutter. */
  iconLabel?: (icon: MarkIcon) => string
  /** Idioma para comparar textos. */
  locale?: string
}

export const DEFAULT_LIST_OPTIONS: Pick<WaypointListOptions, 'order' | 'descending'> = { order: 'date', descending: true }

/**
 * Filtra y ordena. Ante empate (misma descripción o mismo ícono) desempata por fecha en el mismo sentido,
 * igual que `_ordenarLista` de la app Flutter.
 */
export function sortWaypoints(list: readonly Waypoint[], opts: WaypointListOptions): Waypoint[] {
  const collator = new Intl.Collator(opts.locale, { sensitivity: 'base', numeric: true })
  const dir = opts.descending ? -1 : 1
  const key = (w: Waypoint): string =>
    opts.order === 'name' ? w.description : opts.order === 'icon' ? (opts.iconLabel?.(w.icon) ?? w.icon) : ''
  return list
    .filter((w) => matchesSearch(w.description, opts.query ?? ''))
    .sort((a, b) => {
      const byKey = opts.order === 'date' ? 0 : collator.compare(key(a), key(b))
      return dir * (byKey || a.recordedAt - b.recordedAt)
    })
}

export interface DayGroup<T> {
  /** Día local `AAAA-MM-DD`. */
  day: string
  items: T[]
}

/** Agrupa por día local consecutivo (la lista ya viene ordenada por fecha). */
export function groupByDay<T extends { recordedAt: number }>(list: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of list) {
    const d = new Date(item.recordedAt)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}
