import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { createDatabase, type AppDatabase } from '@/db/client'
import { createSqlEngine, type SqlEngine } from '@/db/engine'
import { MIGRATIONS } from '@/db/migrations'

const sqlite3Promise = sqlite3InitModule()

/**
 * Base SQLite real (sqlite-wasm en Node, en memoria) con las mismas migraciones y el mismo motor que el
 * worker del navegador. Los tests de repositorios corren SQL de verdad, no un doble en memoria.
 */
export async function createTestDb(): Promise<{ db: AppDatabase; engine: SqlEngine }> {
  const sqlite3 = await sqlite3Promise
  const engine = createSqlEngine(new sqlite3.oo1.DB(':memory:', 'c'))
  engine.migrate(MIGRATIONS)
  return { db: createDatabase(engine), engine }
}

/** Reloj controlable para los tests. */
export function fakeClock(start = Date.UTC(2026, 10, 18, 12)) {
  let now = start
  const clock = () => now
  clock.advance = (ms: number) => {
    now += ms
  }
  return clock
}
