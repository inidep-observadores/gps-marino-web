import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // El dominio compartido es TypeScript sin compilar: se incluye en el paquete.
  noExternal: ['@gpsm/shared'],
  tsconfig: 'tsconfig.json',
})
