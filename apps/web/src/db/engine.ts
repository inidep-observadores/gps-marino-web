import type { BindableValue, Database } from '@sqlite.org/sqlite-wasm'

/** Método de consulta que usa el driver `sqlite-proxy` de Drizzle. */
export type QueryMethod = 'run' | 'all' | 'values' | 'get'

export interface QueryRequest {
  sql: string
  params: unknown[]
  method: QueryMethod
}

export interface QueryResult {
  rows: unknown[]
}

export interface Migration {
  /** Nombre del archivo sin extensión (`0000_init`): es la clave que queda registrada en `__migrations`. */
  tag: string
  sql: string
}

/**
 * Motor SQL sobre una base de sqlite-wasm (API oo1). Es síncrono y no conoce al worker ni a Drizzle:
 * lo usan tanto el worker del navegador como los tests en Node, así ambos ejecutan exactamente el mismo código.
 */
export interface SqlEngine {
  query(req: QueryRequest): QueryResult
  /** Varias consultas en una sola transacción: o se aplican todas o ninguna. */
  batch(reqs: QueryRequest[]): QueryResult[]
  /** Aplica en orden las migraciones que falten; devuelve las aplicadas ahora. */
  migrate(migrations: Migration[]): string[]
}

const BREAKPOINT = '--> statement-breakpoint'

export function createSqlEngine(db: Database): SqlEngine {
  db.exec('PRAGMA foreign_keys = ON;')

  function query({ sql, params, method }: QueryRequest): QueryResult {
    const rows = db.exec({
      sql,
      bind: params.length ? (params as BindableValue[]) : undefined,
      rowMode: 'array',
      returnValue: 'resultRows',
    }) as unknown[][]
    if (method === 'run') return { rows: [] }
    // Drizzle espera una sola fila (como arreglo de valores) para `get`, y la lista de filas para `all`/`values`.
    if (method === 'get') return { rows: (rows[0] ?? undefined) as unknown as unknown[] }
    return { rows }
  }

  function inTransaction<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE')
    try {
      const out = fn()
      db.exec('COMMIT')
      return out
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  return {
    query,
    batch: (reqs) => inTransaction(() => reqs.map(query)),
    migrate(migrations) {
      db.exec('CREATE TABLE IF NOT EXISTS __migrations (tag TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)')
      const done = new Set(
        (db.exec({ sql: 'SELECT tag FROM __migrations', rowMode: 'array', returnValue: 'resultRows' }) as string[][]).map(
          (r) => r[0],
        ),
      )
      const applied: string[] = []
      for (const m of [...migrations].sort((a, b) => a.tag.localeCompare(b.tag))) {
        if (done.has(m.tag)) continue
        inTransaction(() => {
          for (const stmt of m.sql.split(BREAKPOINT)) if (stmt.trim()) db.exec(stmt)
          db.exec({ sql: 'INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)', bind: [m.tag, Date.now()] })
        })
        applied.push(m.tag)
      }
      return applied
    },
  }
}
