import { execSync } from 'node:child_process'
import pg from 'pg'

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://gpsm:gpsm@localhost:5437/gpsm_test'

/** Crea la base de pruebas si falta y le aplica las migraciones. Requiere `docker compose up -d db`. */
export default async function setup() {
  const url = new URL(TEST_DB_URL)
  const name = url.pathname.slice(1)
  const admin = new pg.Client({ connectionString: TEST_DB_URL.replace(`/${name}`, '/postgres') })
  try {
    await admin.connect()
  } catch (e) {
    throw new Error(`No se pudo conectar a Postgres (${url.host}). Levantalo con: docker compose up -d db\n${(e as Error).message}`)
  }
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`)
  await admin.end()
  execSync('pnpm exec prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: TEST_DB_URL } })
}
