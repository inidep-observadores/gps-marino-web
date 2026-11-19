import { defineConfig } from 'drizzle-kit'

/** Solo genera las migraciones SQL; las aplica la app en el navegador (`src/db/migrate.ts`). */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
})
