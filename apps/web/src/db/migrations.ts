import type { Migration } from './engine'

/**
 * Migraciones generadas por `pnpm db:generate` (drizzle-kit), empaquetadas con la app para que la base
 * se cree y se actualice sin conexión. Vite (y Vitest) resuelven el glob en tiempo de compilación.
 */
const files = import.meta.glob<string>('./migrations/*.sql', { query: '?raw', import: 'default', eager: true })

export const MIGRATIONS: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ tag: path.split('/').pop()!.replace(/\.sql$/, ''), sql }))
  .sort((a, b) => a.tag.localeCompare(b.tag))
