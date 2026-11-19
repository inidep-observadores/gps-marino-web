import { z } from 'zod'
import {
  importedLayerSchema,
  routePointSchema,
  settingSchema,
  waypointSchema,
} from './domain'

/**
 * Protocolo de sincronización entre la web (SQLite) y la API (Postgres).
 *
 * - `push`: el cliente sube sus registros `dirty`. El servidor aplica "última escritura gana" por registro según
 *   `updatedAt` (reloj del cliente, acotado al reloj del servidor + 5 min) y asigna un `serverVersion` creciente por usuario.
 * - `pull`: el cliente pide todo lo cambiado después de un cursor (`since` = último `serverVersion` recibido).
 * - Los borrados viajan como `deletedAt` (borrado lógico).
 */

/** Cantidad máxima de registros por pedido (el cliente parte la cola en tandas). */
export const SYNC_MAX_RECORDS = 500
export const SYNC_MAX_TRACK_POINTS = 2000
/** Tope del contenido de una capa importada (caracteres). */
export const SYNC_MAX_LAYER_CHARS = 5_000_000
export const SYNC_MAX_SETTING_BYTES = 64_000

const layerSyncSchema = importedLayerSchema.extend({ content: z.string().max(SYNC_MAX_LAYER_CHARS) })

export const trackPointSyncSchema = z.object({
  seq: z.number().int().nonnegative(),
  t: z.number().int().nonnegative(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  speedKn: z.number().min(0).nullable(),
  courseDeg: z.number().min(0).max(360).nullable(),
})
export type TrackPointSync = z.infer<typeof trackPointSyncSchema>

export const trackSyncSchema = z.object({
  id: z.uuid(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  deletedAt: z.number().int().nonnegative().nullable(),
  name: z.string().min(1).max(200),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().nullable(),
  distanceNm: z.number().min(0),
  pointCount: z.number().int().nonnegative(),
  visible: z.boolean(),
})
export type TrackSync = z.infer<typeof trackSyncSchema>

export const settingSyncSchema = settingSchema.extend({
  key: z.string().min(1).max(100),
  value: z.json().refine((v) => JSON.stringify(v).length <= SYNC_MAX_SETTING_BYTES, 'value too large'),
})

/** Ruta activa: se sincroniza completa (una por usuario). Lista vacía = sin ruta. */
export const routeSyncSchema = z.object({
  updatedAt: z.number().int().nonnegative(),
  points: z.array(routePointSchema).max(200),
})
export type RouteSync = z.infer<typeof routeSyncSchema>

export const pushRequestSchema = z.object({
  waypoints: z.array(waypointSchema).max(SYNC_MAX_RECORDS).default([]),
  layers: z.array(layerSyncSchema).max(20).default([]),
  tracks: z.array(trackSyncSchema).max(SYNC_MAX_RECORDS).default([]),
  /** Puntos de derrota nuevos, por derrota (se agregan por `seq`; repetir un `seq` es inofensivo). */
  trackPoints: z
    .array(z.object({ trackId: z.uuid(), points: z.array(trackPointSyncSchema).max(SYNC_MAX_TRACK_POINTS) }))
    .max(20)
    .default([]),
  settings: z.array(settingSyncSchema).max(SYNC_MAX_RECORDS).default([]),
  route: routeSyncSchema.nullable().default(null),
})
export type PushRequest = z.input<typeof pushRequestSchema>
export type PushPayload = z.output<typeof pushRequestSchema>

/** Resultado por registro: `applied: false` = el servidor tenía algo más nuevo (el cliente lo recibirá en el próximo pull). */
export const pushResultSchema = z.object({ applied: z.boolean(), serverVersion: z.number().int() })
export type PushResult = z.infer<typeof pushResultSchema>

export interface PushResponse {
  /** Último `serverVersion` del usuario tras aplicar el pedido. */
  cursor: number
  waypoints: Record<string, PushResult>
  layers: Record<string, PushResult>
  tracks: Record<string, PushResult>
  settings: Record<string, PushResult>
  route: PushResult | null
}

const versioned = { serverVersion: z.number().int().nonnegative() }

export const pullResponseSchema = z.object({
  /** Guardar y usar como `since` en el próximo pull. */
  cursor: z.number().int().nonnegative(),
  /** Hay más cambios: volver a pedir enseguida con el nuevo cursor. */
  hasMore: z.boolean(),
  waypoints: z.array(waypointSchema.extend(versioned)),
  layers: z.array(layerSyncSchema.extend(versioned)),
  tracks: z.array(trackSyncSchema.extend(versioned)),
  settings: z.array(settingSyncSchema.extend(versioned)),
  route: routeSyncSchema.extend(versioned).nullable(),
})
export type PullResponse = z.infer<typeof pullResponseSchema>

export const pullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_MAX_RECORDS).default(200),
})

export const trackPointsQuerySchema = z.object({
  from: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_MAX_TRACK_POINTS).default(SYNC_MAX_TRACK_POINTS),
})

/** Ajuste de tiempo: un reloj de cliente adelantado más que esto se recorta al reloj del servidor. */
export const MAX_CLOCK_SKEW_MS = 5 * 60_000
export function clampUpdatedAt(updatedAt: number, serverNow: number): number {
  return Math.min(updatedAt, serverNow + MAX_CLOCK_SKEW_MS)
}

/** ¿Gana el registro entrante sobre el que ya está en el servidor? (empate: gana el entrante, así reintentar es idempotente) */
export function incomingWins(incomingUpdatedAt: number, existingUpdatedAt: number | null): boolean {
  return existingUpdatedAt === null || incomingUpdatedAt >= existingUpdatedAt
}
