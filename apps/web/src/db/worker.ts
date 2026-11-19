/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm'
import { createSqlEngine, type SqlEngine } from './engine'
import { MIGRATIONS } from './migrations'
import { dbFileName, type DbInfo, type DbWorkerApi } from './protocol'

/**
 * Worker de la base local. SQLite corre aquí (no en el hilo principal) porque el almacenamiento OPFS
 * con acceso síncrono solo existe en workers, y así las consultas no traban la interfaz.
 *
 * Se usa el VFS `opfs-sahpool`: persiste en el almacenamiento privado del origen y NO requiere las
 * cabeceras COOP/COEP. Limitación: un solo contexto puede tenerlo abierto; si otra pestaña ya tiene la
 * base, se cae a una base en memoria y se informa el motivo (la interfaz lo muestra).
 */

const sqlite3Promise = sqlite3InitModule()
let poolPromise: ReturnType<Awaited<typeof sqlite3Promise>['installOpfsSAHPoolVfs']> | null = null

let db: Database | null = null
let engine: SqlEngine | null = null

function requireEngine(): SqlEngine {
  if (!engine) throw new Error('La base no está abierta')
  return engine
}

const api: DbWorkerApi = {
  async open(name) {
    await api.close()
    const sqlite3 = await sqlite3Promise
    const file = dbFileName(name)
    let storage: DbInfo['storage'] = 'opfs'
    let fallbackReason: string | undefined
    try {
      poolPromise ??= sqlite3.installOpfsSAHPoolVfs({ name: 'gpsm-pool', preserveOnInitFailure: true })
      const pool = await poolPromise
      db = new pool.OpfsSAHPoolDb(file)
    } catch (e) {
      poolPromise = null
      storage = 'memory'
      fallbackReason = e instanceof Error ? e.message : String(e)
      db = new sqlite3.oo1.DB(':memory:', 'c')
    }
    engine = createSqlEngine(db)
    const migrated = engine.migrate(MIGRATIONS)
    return { storage, file, sqliteVersion: sqlite3.version.libVersion, fallbackReason, migrated }
  },
  async query(req) {
    return requireEngine().query(req)
  },
  async batch(reqs) {
    return requireEngine().batch(reqs)
  },
  async close() {
    db?.close()
    db = null
    engine = null
  },
}

Comlink.expose(api)
