import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { MarkColor, MarkIcon, LayerFormat } from '@gpsm/shared'

/**
 * Esquema de la base local (SQLite en el navegador). Los nombres de columnas son los mismos que tendrá
 * Postgres en la etapa 2 (sin `user_id`: cada usuario tiene su propio archivo de base).
 *
 * Toda tabla sincronizable lleva:
 * - `id` UUID v7 generado en el cliente;
 * - `created_at` / `updated_at` en ms; `deleted_at` = borrado lógico (para propagar borrados);
 * - `dirty` = 1 si tiene cambios sin subir; `server_version` = última versión confirmada por el servidor.
 *
 * Después de cambiar este archivo: `pnpm db:generate` crea la migración en `src/db/migrations`.
 */
const syncColumns = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
  serverVersion: integer('server_version'),
}

export const waypoints = sqliteTable(
  'waypoints',
  {
    ...syncColumns,
    description: text('description').notNull().default(''),
    recordedAt: integer('recorded_at').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    speedKn: real('speed_kn').notNull().default(0),
    bearing: real('bearing').notNull().default(0),
    icon: text('icon').$type<MarkIcon>().notNull(),
    color: text('color').$type<MarkColor>().notNull(),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('waypoints_recorded_at_idx').on(t.recordedAt), index('waypoints_dirty_idx').on(t.dirty)],
)

export const importedLayers = sqliteTable(
  'imported_layers',
  {
    ...syncColumns,
    name: text('name').notNull(),
    format: text('format').$type<LayerFormat>().notNull(),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    importedAt: integer('imported_at').notNull(),
    hiddenFeatures: text('hidden_features', { mode: 'json' }).$type<string[]>().notNull().default([]),
    showDescriptions: integer('show_descriptions', { mode: 'boolean' }).notNull().default(false),
    content: text('content').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
  },
  (t) => [index('imported_layers_dirty_idx').on(t.dirty)],
)

/** Ajustes que viajan con la cuenta (mapa, rutas, capas base). Las preferencias del dispositivo van en localStorage. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
})

/** Ruta activa: puntos en orden (`position`). Se persiste para que una recarga no la pierda. */
export const routePoints = sqliteTable('route_points', {
  position: integer('position').primaryKey(),
  name: text('name').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  waypointId: text('waypoint_id'),
})

/** Datos propios de la base: dueño (`user_id`), cursor de sincronización, etc. */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

/**
 * Derrotas grabadas. La cabecera se sincroniza como cualquier entidad; los puntos (`track_points`) son datos hijos
 * que no se editan: se agregan en orden (`seq`) mientras se graba y se borran junto con la derrota.
 */
export const tracks = sqliteTable(
  'tracks',
  {
    ...syncColumns,
    name: text('name').notNull(),
    startedAt: integer('started_at').notNull(),
    /** `null` mientras se está grabando. */
    endedAt: integer('ended_at'),
    distanceNm: real('distance_nm').notNull().default(0),
    pointCount: integer('point_count').notNull().default(0),
    /** Mostrar la derrota en el mapa. */
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    /** Índice del color en el mapa (`TRACK_COLOR_COUNT`); `null` en derrotas anteriores (el color sale del id). */
    color: integer('color'),
  },
  (t) => [index('tracks_started_at_idx').on(t.startedAt)],
)

export const trackPoints = sqliteTable(
  'track_points',
  {
    trackId: text('track_id').notNull(),
    seq: integer('seq').notNull(),
    t: integer('t').notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    speedKn: real('speed_kn'),
    courseDeg: real('course_deg'),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.seq] })],
)
