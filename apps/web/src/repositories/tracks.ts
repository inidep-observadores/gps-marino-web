import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { trackDistanceNm, uuidv7, type TrackPoint } from '@gpsm/shared'
import type { AppDatabase } from '@/db/client'
import { trackPoints, tracks } from '@/db/schema'
import { type Clock, systemClock } from './clock'

/** Cabecera de una derrota (sin los puntos). */
export interface Track {
  id: string
  name: string
  startedAt: number
  endedAt: number | null
  distanceNm: number
  pointCount: number
  visible: boolean
}

export interface TrackRepository {
  /** Derrotas vigentes, de la más reciente a la más antigua. */
  list(): Promise<Track[]>
  create(name: string, startedAt: number): Promise<Track>
  /** Agrega puntos al final (en una transacción) y actualiza distancia y cantidad. */
  append(id: string, points: TrackPoint[]): Promise<void>
  /** Cierra la derrota (queda con hora de fin). */
  finish(id: string, endedAt: number): Promise<void>
  points(id: string): Promise<TrackPoint[]>
  setVisible(id: string, visible: boolean): Promise<void>
  rename(id: string, name: string): Promise<void>
  /** Baja lógica de la derrota (para sincronizar el borrado) y borra sus puntos. */
  remove(id: string): Promise<void>
  /** Derrotas que quedaron abiertas (la app se cerró grabando). */
  unfinished(): Promise<Track[]>
}

type Row = typeof tracks.$inferSelect
const toTrack = (r: Row): Track => ({ id: r.id, name: r.name, startedAt: r.startedAt, endedAt: r.endedAt, distanceNm: r.distanceNm, pointCount: r.pointCount, visible: r.visible })

const CHUNK = 150 // 7 columnas × 150 = 1050 parámetros por sentencia

export function createTrackRepository(db: AppDatabase, clock: Clock = systemClock): TrackRepository {
  const alive = isNull(tracks.deletedAt)
  const touch = () => ({ updatedAt: clock(), dirty: true })

  return {
    async list() {
      return (await db.select().from(tracks).where(alive).orderBy(desc(tracks.startedAt))).map(toTrack)
    },
    async unfinished() {
      return (await db.select().from(tracks).where(and(alive, isNull(tracks.endedAt)))).map(toTrack)
    },
    async create(name, startedAt) {
      const now = clock()
      const row = { id: uuidv7(now), name, startedAt, endedAt: null, distanceNm: 0, pointCount: 0, visible: true, createdAt: now, updatedAt: now, deletedAt: null, dirty: true }
      await db.insert(tracks).values(row)
      return toTrack({ ...row, serverVersion: null })
    },
    async append(id, points) {
      if (!points.length) return
      const head = await db.select({ n: tracks.pointCount }).from(tracks).where(eq(tracks.id, id))
      const seq0 = head[0]?.n ?? 0
      // La distancia agregada incluye el tramo desde el último punto ya guardado.
      const prev = seq0
        ? (await db.select().from(trackPoints).where(and(eq(trackPoints.trackId, id), eq(trackPoints.seq, seq0 - 1))))[0]
        : undefined
      const chain = prev ? [{ lat: prev.lat, lon: prev.lon }, ...points] : points
      const added = trackDistanceNm(chain)
      const inserts = []
      for (let i = 0; i < points.length; i += CHUNK) {
        inserts.push(
          db.insert(trackPoints).values(
            points.slice(i, i + CHUNK).map((p, k) => ({ trackId: id, seq: seq0 + i + k, t: p.t, lat: p.lat, lon: p.lon, speedKn: p.speedKn, courseDeg: p.courseDeg })),
          ),
        )
      }
      const update = db
        .update(tracks)
        .set({ pointCount: seq0 + points.length, distanceNm: sql`${tracks.distanceNm} + ${added}`, ...touch() })
        .where(eq(tracks.id, id))
      // Drizzle tipa `batch` con una tupla no vacía: se arma la lista con el UPDATE primero.
      await db.batch([update, ...inserts] as unknown as Parameters<typeof db.batch>[0])
    },
    async finish(id, endedAt) {
      await db.update(tracks).set({ endedAt, ...touch() }).where(eq(tracks.id, id))
    },
    async points(id) {
      const rows = await db.select().from(trackPoints).where(eq(trackPoints.trackId, id)).orderBy(asc(trackPoints.seq))
      return rows.map((r) => ({ t: r.t, lat: r.lat, lon: r.lon, speedKn: r.speedKn, courseDeg: r.courseDeg }))
    },
    async setVisible(id, visible) {
      await db.update(tracks).set({ visible, ...touch() }).where(eq(tracks.id, id))
    },
    async rename(id, name) {
      await db.update(tracks).set({ name, ...touch() }).where(eq(tracks.id, id))
    },
    async remove(id) {
      const now = clock()
      await db.batch([
        db.delete(trackPoints).where(eq(trackPoints.trackId, id)),
        db.update(tracks).set({ deletedAt: now, updatedAt: now, dirty: true, pointCount: 0 }).where(and(eq(tracks.id, id), alive)),
      ])
    },
  }
}
