import { describe, expect, it } from 'vitest'
import { createSqlEngine } from '@/db/engine'
import { MIGRATIONS } from '@/db/migrations'
import { dbFileName } from '@/db/protocol'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { createTestDb } from './helpers/testDb'

describe('motor SQL y migraciones', () => {
  it('empaqueta las migraciones generadas por drizzle-kit', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0)
    expect(MIGRATIONS[0]!.tag).toBe('0000_init')
  })

  it('crea las tablas y no repite migraciones ya aplicadas', async () => {
    const sqlite3 = await sqlite3InitModule()
    const engine = createSqlEngine(new sqlite3.oo1.DB(':memory:', 'c'))
    expect(engine.migrate(MIGRATIONS)).toEqual(MIGRATIONS.map((m) => m.tag))
    expect(engine.migrate(MIGRATIONS)).toEqual([])
    const { rows } = engine.query({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      params: [],
      method: 'all',
    })
    expect(rows.flat()).toEqual(['__migrations', 'imported_layers', 'meta', 'route_points', 'settings', 'waypoints'])
  })

  it('una migración que falla no deja cambios a medias', async () => {
    const { engine } = await createTestDb()
    expect(() => engine.migrate([{ tag: '9999_bad', sql: 'CREATE TABLE t1 (a);--> statement-breakpoint\nNOT SQL' }])).toThrow()
    const { rows } = engine.query({ sql: "SELECT count(*) FROM sqlite_master WHERE name = 't1'", params: [], method: 'get' })
    expect(rows).toEqual([0])
  })

  it('batch es atómico', async () => {
    const { engine } = await createTestDb()
    const ins = (k: string) => ({ sql: 'INSERT INTO meta (key, value) VALUES (?, ?)', params: [k, 'v'], method: 'run' as const })
    expect(() => engine.batch([ins('a'), ins('a')])).toThrow()
    expect(engine.query({ sql: 'SELECT count(*) FROM meta', params: [], method: 'get' }).rows).toEqual([0])
  })

  it('nombres de archivo seguros por usuario', () => {
    expect(dbFileName('anon')).toBe('/gpsm-anon.sqlite3')
    expect(dbFileName('User@Mail.com/../x')).toBe('/gpsm-user_mail_com____x.sqlite3')
    expect(dbFileName('')).toBe('/gpsm-anon.sqlite3')
  })
})
