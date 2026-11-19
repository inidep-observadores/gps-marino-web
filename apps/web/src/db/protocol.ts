import type { QueryRequest, QueryResult } from './engine'

/** Dónde quedó guardada la base que se abrió. */
export type StorageKind = 'opfs' | 'memory'

export interface DbInfo {
  storage: StorageKind
  /** Archivo dentro del almacenamiento privado del origen (OPFS). */
  file: string
  sqliteVersion: string
  /** Si no se pudo usar OPFS, el motivo (navegador sin soporte, otra pestaña con la base abierta...). */
  fallbackReason?: string
  /** Migraciones aplicadas en esta apertura. */
  migrated: string[]
}

/** API que expone el worker de la base (vía Comlink). */
export interface DbWorkerApi {
  /** Abre (o crea) la base `name` y la migra. Cierra la que hubiera abierta. */
  open(name: string): Promise<DbInfo>
  query(req: QueryRequest): Promise<QueryResult>
  batch(reqs: QueryRequest[]): Promise<QueryResult[]>
  close(): Promise<void>
}

/** Nombre de archivo seguro para la base de un usuario (`anon` = sin sesión). */
export function dbFileName(name: string): string {
  const safe = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64) || 'anon'
  return `/gpsm-${safe}.sqlite3`
}
