import { and, asc, eq, isNull } from 'drizzle-orm'
import { uuidv7, type ImportedLayer, type ImportedLayerInput } from '@gpsm/shared'
import type { AppDatabase } from '@/db/client'
import { importedLayers } from '@/db/schema'
import { type Clock, systemClock } from './clock'

/** Capas que el usuario importó (GeoJSON/GPX). El contenido del archivo se guarda en la propia base. */
export interface LayerRepository {
  list(): Promise<ImportedLayer[]>
  get(id: string): Promise<ImportedLayer | null>
  findByName(name: string): Promise<ImportedLayer | null>
  create(input: ImportedLayerInput): Promise<ImportedLayer>
  update(id: string, patch: Partial<ImportedLayerInput>): Promise<ImportedLayer | null>
  remove(id: string): Promise<void>
}

type Row = typeof importedLayers.$inferSelect

export function toLayer(row: Row): ImportedLayer {
  const { dirty: _dirty, serverVersion: _serverVersion, sizeBytes: _sizeBytes, ...rest } = row
  return rest
}

/** Tamaño en bytes (UTF-8) del contenido: sirve para mostrar el espacio usado y para topes al sincronizar. */
const byteSize = (s: string) => new TextEncoder().encode(s).length

export function createLayerRepository(db: AppDatabase, clock: Clock = systemClock): LayerRepository {
  const alive = isNull(importedLayers.deletedAt)

  async function get(id: string) {
    const row = await db.query.importedLayers.findFirst({ where: and(eq(importedLayers.id, id), alive) })
    return row ? toLayer(row) : null
  }

  return {
    async list() {
      const rows = await db.select().from(importedLayers).where(alive).orderBy(asc(importedLayers.importedAt))
      return rows.map(toLayer)
    },
    get,
    async findByName(name) {
      const row = await db.query.importedLayers.findFirst({ where: and(eq(importedLayers.name, name), alive) })
      return row ? toLayer(row) : null
    },
    async create(input) {
      const now = clock()
      const row = {
        ...input,
        id: uuidv7(now),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        dirty: true,
        sizeBytes: byteSize(input.content),
      }
      await db.insert(importedLayers).values(row)
      return toLayer({ ...row, serverVersion: null })
    },
    async update(id, patch) {
      const size = patch.content !== undefined ? { sizeBytes: byteSize(patch.content) } : {}
      await db
        .update(importedLayers)
        .set({ ...patch, ...size, updatedAt: clock(), dirty: true })
        .where(and(eq(importedLayers.id, id), alive))
      return get(id)
    },
    async remove(id) {
      const now = clock()
      // El contenido se vacía al borrar: el registro queda solo como marca para sincronizar el borrado.
      await db
        .update(importedLayers)
        .set({ deletedAt: now, updatedAt: now, dirty: true, content: '', sizeBytes: 0 })
        .where(and(eq(importedLayers.id, id), alive))
    },
  }
}
