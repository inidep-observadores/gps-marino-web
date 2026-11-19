import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { uuidv7, type Waypoint, type WaypointInput } from '@gpsm/shared'
import type { AppDatabase } from '@/db/client'
import { waypoints } from '@/db/schema'
import { type Clock, systemClock } from './clock'

/** Persistencia de las ubicaciones guardadas. Los borrados son lógicos (`deleted_at`) para poder sincronizarlos. */
export interface WaypointRepository {
  /** Ubicaciones vigentes, de la más reciente a la más antigua. */
  list(): Promise<Waypoint[]>
  get(id: string): Promise<Waypoint | null>
  count(): Promise<number>
  create(input: WaypointInput): Promise<Waypoint>
  update(id: string, patch: Partial<WaypointInput>): Promise<Waypoint | null>
  setVisible(ids: string[], visible: boolean): Promise<void>
  remove(ids: string[]): Promise<void>
  /**
   * Alta masiva (restaurar una copia) en una sola transacción. Si un registro trae `id` (copia hecha por esta
   * app) se conserva, para que la identidad sobreviva al cambiar de dispositivo y a la sincronización.
   * Con `replace`, antes se dan de baja todas las ubicaciones vigentes (en la misma transacción).
   */
  importMany(records: ImportRecord[], opts?: { replace?: boolean }): Promise<number>
}

export interface ImportRecord {
  input: WaypointInput
  id?: string | null
}

/** Filas por sentencia INSERT (15 columnas × 200 = 3000 parámetros, lejos del límite de SQLite). */
const INSERT_CHUNK = 200

type Row = typeof waypoints.$inferSelect

export function toWaypoint(row: Row): Waypoint {
  const { dirty: _dirty, serverVersion: _serverVersion, ...rest } = row
  return rest
}

export function createWaypointRepository(db: AppDatabase, clock: Clock = systemClock): WaypointRepository {
  const alive = isNull(waypoints.deletedAt)

  async function get(id: string) {
    const row = await db.query.waypoints.findFirst({ where: and(eq(waypoints.id, id), alive) })
    return row ? toWaypoint(row) : null
  }

  return {
    async list() {
      const rows = await db.select().from(waypoints).where(alive).orderBy(desc(waypoints.recordedAt))
      return rows.map(toWaypoint)
    },
    get,
    async count() {
      const [row] = await db.select({ n: count() }).from(waypoints).where(alive)
      return row?.n ?? 0
    },
    async create(input) {
      const now = clock()
      const row = { ...input, id: uuidv7(now), createdAt: now, updatedAt: now, deletedAt: null, dirty: true }
      await db.insert(waypoints).values(row)
      return toWaypoint({ ...row, serverVersion: null })
    },
    async update(id, patch) {
      await db
        .update(waypoints)
        .set({ ...patch, updatedAt: clock(), dirty: true })
        .where(and(eq(waypoints.id, id), alive))
      return get(id)
    },
    async setVisible(ids, visible) {
      if (!ids.length) return
      await db
        .update(waypoints)
        .set({ visible, updatedAt: clock(), dirty: true })
        .where(and(inArray(waypoints.id, ids), alive))
    },
    async remove(ids) {
      if (!ids.length) return
      const now = clock()
      await db
        .update(waypoints)
        .set({ deletedAt: now, updatedAt: now, dirty: true })
        .where(and(inArray(waypoints.id, ids), alive))
    },
    async importMany(records, opts = {}) {
      const now = clock()
      const rows = records.map((r, i) => ({
        ...r.input,
        id: r.id ?? uuidv7(now + i),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        dirty: true,
      }))
      // Un id ya usado (p. ej. una ubicación borrada antes) se reactiva con los datos de la copia.
      const inserts = []
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        inserts.push(
          db
            .insert(waypoints)
            .values(rows.slice(i, i + INSERT_CHUNK))
            .onConflictDoUpdate({
              target: waypoints.id,
              set: {
                description: sql`excluded.description`,
                recordedAt: sql`excluded.recorded_at`,
                lat: sql`excluded.lat`,
                lon: sql`excluded.lon`,
                speedKn: sql`excluded.speed_kn`,
                bearing: sql`excluded.bearing`,
                icon: sql`excluded.icon`,
                color: sql`excluded.color`,
                visible: sql`excluded.visible`,
                deletedAt: null,
                updatedAt: now,
                dirty: true,
              },
            }),
        )
      }
      const wipe = opts.replace
        ? [db.update(waypoints).set({ deletedAt: now, updatedAt: now, dirty: true }).where(alive)]
        : []
      const stmts = [...wipe, ...inserts]
      if (!stmts.length) return 0
      await db.batch(stmts as [(typeof stmts)[number], ...(typeof stmts)[number][]])
      return rows.length
    },
  }
}
