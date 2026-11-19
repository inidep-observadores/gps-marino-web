import { asc, eq } from 'drizzle-orm'
import type { RoutePoint } from '@gpsm/shared'
import type { AppDatabase } from '@/db/client'
import { routePoints, settings } from '@/db/schema'
import { type Clock, systemClock } from './clock'

/** Ajustes sincronizables (clave → valor JSON). */
export interface SettingsRepository {
  get<T>(key: string, fallback: T): Promise<T>
  set(key: string, value: unknown): Promise<void>
  all(): Promise<Record<string, unknown>>
}

export function createSettingsRepository(db: AppDatabase, clock: Clock = systemClock): SettingsRepository {
  return {
    async get(key, fallback) {
      const row = await db.query.settings.findFirst({ where: eq(settings.key, key) })
      return row ? (row.value as typeof fallback) : fallback
    },
    async set(key, value) {
      const updatedAt = clock()
      await db
        .insert(settings)
        .values({ key, value, updatedAt, dirty: true })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt, dirty: true } })
    },
    async all() {
      const rows = await db.select().from(settings)
      return Object.fromEntries(rows.map((r) => [r.key, r.value]))
    },
  }
}

/** Ruta activa persistida (sobrevive a una recarga de la página). */
export interface RouteRepository {
  get(): Promise<RoutePoint[]>
  /** Reemplaza la ruta completa (en una transacción). */
  replace(points: RoutePoint[]): Promise<void>
}

export function createRouteRepository(db: AppDatabase): RouteRepository {
  return {
    async get() {
      const rows = await db.select().from(routePoints).orderBy(asc(routePoints.position))
      return rows.map(({ name, lat, lon, waypointId }) => ({ name, lat, lon, waypointId }))
    },
    async replace(points) {
      const del = db.delete(routePoints)
      if (!points.length) {
        await del
        return
      }
      await db.batch([del, db.insert(routePoints).values(points.map((p, position) => ({ ...p, position })))])
    },
  }
}
