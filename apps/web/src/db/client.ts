import * as Comlink from 'comlink'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import type { QueryRequest, QueryResult } from './engine'
import type { DbInfo, DbWorkerApi } from './protocol'
import * as schema from './schema'

export type AppDatabase = SqliteRemoteDatabase<typeof schema>

/** Transporte mínimo que necesita Drizzle: el worker en el navegador o el motor directo en los tests. */
export interface SqlTransport {
  query(req: QueryRequest): Promise<QueryResult> | QueryResult
  batch(reqs: QueryRequest[]): Promise<QueryResult[]> | QueryResult[]
}

/** Instancia de Drizzle (tipada con el esquema) sobre cualquier transporte. */
export function createDatabase(transport: SqlTransport): AppDatabase {
  return drizzle(
    async (sql, params, method) => transport.query({ sql, params, method }),
    async (queries) => transport.batch(queries.map((q) => ({ sql: q.sql, params: q.params, method: q.method }))),
    { schema },
  )
}

let worker: Comlink.Remote<DbWorkerApi> | null = null

function getWorker(): Comlink.Remote<DbWorkerApi> {
  worker ??= Comlink.wrap<DbWorkerApi>(new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }))
  return worker
}

/**
 * Abre la base local `name` (`anon` sin sesión; en la etapa 2, una por usuario) en el worker.
 * Pide almacenamiento persistente para que el navegador no la borre al liberar espacio.
 */
export async function openDatabase(name = 'anon'): Promise<{ db: AppDatabase; info: DbInfo }> {
  const api = getWorker()
  const info = await api.open(name)
  void navigator.storage?.persist?.().catch(() => false)
  return { db: createDatabase({ query: (r) => api.query(r), batch: (r) => api.batch(r) }), info }
}
