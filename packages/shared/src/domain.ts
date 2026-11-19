import { z } from 'zod'
import { MARK_COLORS, MARK_ICONS } from './marks'

/**
 * Modelo de dominio compartido por la web (SQLite) y la API (Postgres).
 * Unidades: velocidad en NUDOS, rumbo en GRADOS (0–360), coordenadas en grados decimales (WGS84),
 * instantes en ms desde epoch (UTC).
 */

/** Campos de sincronización comunes a toda entidad del usuario. `deletedAt` = borrado lógico. */
export const syncMetaSchema = z.object({
  id: z.uuid(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
})
export type SyncMeta = z.infer<typeof syncMetaSchema>

export const latitudeSchema = z.number().min(-90).max(90)
export const longitudeSchema = z.number().min(-180).max(180)

export const waypointSchema = syncMetaSchema.extend({
  description: z.string().max(500),
  recordedAt: z.number().int(),
  lat: latitudeSchema,
  lon: longitudeSchema,
  speedKn: z.number().min(0),
  bearing: z.number().min(0).max(360),
  icon: z.enum(MARK_ICONS),
  color: z.enum(MARK_COLORS),
  visible: z.boolean(),
})
export type Waypoint = z.infer<typeof waypointSchema>

/** Datos editables de un waypoint (sin metadatos de sincronización). */
export type WaypointInput = Omit<Waypoint, keyof SyncMeta>

export const LAYER_FORMATS = ['geojson', 'gpx'] as const
export type LayerFormat = (typeof LAYER_FORMATS)[number]

export const importedLayerSchema = syncMetaSchema.extend({
  name: z.string().min(1).max(200),
  format: z.enum(LAYER_FORMATS),
  visible: z.boolean(),
  importedAt: z.number().int(),
  /** Ids de los elementos (features) que el usuario ocultó en el mapa. */
  hiddenFeatures: z.array(z.string()),
  /** Mostrar en el mapa la propiedad `description` de los puntos. */
  showDescriptions: z.boolean(),
  /** Contenido del archivo (GeoJSON o GPX) tal como se importó. */
  content: z.string(),
})
export type ImportedLayer = z.infer<typeof importedLayerSchema>
export type ImportedLayerInput = Omit<ImportedLayer, keyof SyncMeta>

/** Un punto de la ruta activa: un waypoint guardado, un elemento de una capa o la posición del cursor. */
export const routePointSchema = z.object({
  name: z.string(),
  lat: latitudeSchema,
  lon: longitudeSchema,
  waypointId: z.uuid().nullable(),
})
export type RoutePoint = z.infer<typeof routePointSchema>

/** Ajuste sincronizable (clave → valor JSON). Las preferencias propias del dispositivo no van aquí. */
export const settingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
  updatedAt: z.number().int().nonnegative(),
})
export type Setting = z.infer<typeof settingSchema>
