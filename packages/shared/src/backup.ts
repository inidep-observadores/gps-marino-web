import { z } from 'zod'
import type { Waypoint, WaypointInput } from './domain'
import { isMarkColor, isMarkIcon, markColorFromLegacy, markColorToLegacy, markIconFromLegacy, markIconToLegacy } from './marks'

/**
 * Copia de seguridad de ubicaciones en el formato `MogData.json` de la app Flutter, para que las copias
 * se puedan pasar en los dos sentidos (app móvil ↔ web). La app Flutter las comprime en un ZIP con un único
 * archivo `MogData.json` (ver `_compartirSeleccionados` / `_importarJson`).
 *
 * Campos de Flutter (`Waypoint.toJson`): id (int), descripcion, fecha (µs desde epoch como TEXTO), latitud,
 * longitud, velocidad (kn), rumbo (int), markIcon / markColor (ÍNDICES del enum), ver_en_mapa.
 * Copias más viejas (`ObWaypoint.toJson`) usan `icon` / `color` en lugar de `markIcon` / `markColor`.
 * La web agrega `uuid` y `updated` (Flutter ignora claves desconocidas) para no duplicar al combinar.
 */

export const BACKUP_FILE_NAME = 'MogData.json'

export interface MogRecord {
  id: number
  descripcion: string
  fecha: string
  latitud: number
  longitud: number
  velocidad: number
  rumbo: number
  markIcon: number
  markColor: number
  ver_en_mapa: boolean
  uuid?: string
  updated?: number
}

/** Ubicaciones → texto JSON de la copia (formato Flutter + `uuid`). `id: 0` = Flutter les asigna id nuevo. */
export function toMogJson(list: readonly Waypoint[]): string {
  const records: MogRecord[] = list.map((w) => ({
    id: 0,
    descripcion: w.description,
    fecha: String(Math.round(w.recordedAt) * 1000),
    latitud: w.lat,
    longitud: w.lon,
    velocidad: w.speedKn,
    rumbo: Math.round(w.bearing) % 361,
    markIcon: markIconToLegacy(w.icon),
    markColor: markColorToLegacy(w.color),
    ver_en_mapa: w.visible,
    uuid: w.id,
    updated: w.updatedAt,
  }))
  return JSON.stringify(records)
}

const num = z.union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/).transform(Number)])

const recordSchema = z.object({
  descripcion: z.string().nullish(),
  fecha: z.union([z.string(), z.number()]),
  latitud: num,
  longitud: num,
  velocidad: num.nullish(),
  rumbo: num.nullish(),
  markIcon: z.number().int().nullish(),
  markColor: z.number().int().nullish(),
  icon: z.union([z.number().int(), z.string()]).nullish(),
  color: z.union([z.number().int(), z.string()]).nullish(),
  ver_en_mapa: z.boolean().nullish(),
  uuid: z.string().nullish(),
})

export interface ParsedBackupRecord {
  input: WaypointInput
  /** Id de la web si la copia salió de esta app. */
  uuid: string | null
}

export interface ParsedBackup {
  records: ParsedBackupRecord[]
  /** Registros descartados (con su posición en el archivo y el motivo). */
  skipped: { index: number; reason: string }[]
}

export class BackupFormatError extends Error {}

/** Microsegundos (Flutter) o milisegundos → ms. Flutter guarda µs; valores < 1e14 ya son ms. */
function parseFecha(v: string | number): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isFinite(n) && n > 0) return n >= 1e14 ? Math.round(n / 1000) : Math.round(n)
  const d = Date.parse(String(v))
  return Number.isFinite(d) ? d : null
}

function icon(r: z.infer<typeof recordSchema>) {
  if (r.markIcon != null) return markIconFromLegacy(r.markIcon)
  if (typeof r.icon === 'number') return markIconFromLegacy(r.icon)
  if (isMarkIcon(r.icon)) return r.icon
  return markIconFromLegacy(undefined)
}

function color(r: z.infer<typeof recordSchema>) {
  if (r.markColor != null) return markColorFromLegacy(r.markColor)
  if (typeof r.color === 'number') return markColorFromLegacy(r.color)
  if (isMarkColor(r.color)) return r.color
  return markColorFromLegacy(undefined)
}

/** Lee el texto de una copia (Flutter o web). Lanza `BackupFormatError` si no es una lista JSON. */
export function parseMogJson(text: string): ParsedBackup {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new BackupFormatError('invalid-json')
  }
  if (!Array.isArray(data)) throw new BackupFormatError('not-a-list')

  const records: ParsedBackupRecord[] = []
  const skipped: ParsedBackup['skipped'] = []
  data.forEach((raw, index) => {
    const r = recordSchema.safeParse(raw)
    if (!r.success) return skipped.push({ index, reason: 'invalid-record' })
    const v = r.data
    const recordedAt = parseFecha(v.fecha)
    if (recordedAt == null) return skipped.push({ index, reason: 'invalid-date' })
    if (Math.abs(v.latitud) > 90 || Math.abs(v.longitud) > 180) return skipped.push({ index, reason: 'out-of-range' })
    const speed = v.velocidad ?? 0
    const bearing = v.rumbo ?? 0
    records.push({
      input: {
        description: (v.descripcion ?? '').slice(0, 500),
        recordedAt,
        lat: v.latitud,
        lon: v.longitud,
        speedKn: speed >= 0 ? speed : 0,
        bearing: bearing >= 0 && bearing <= 360 ? bearing : 0,
        icon: icon(v),
        color: color(v),
        visible: v.ver_en_mapa ?? false,
      },
      uuid: v.uuid ?? null,
    })
  })
  return { records, skipped }
}

/**
 * Clave para detectar duplicados al combinar una copia con lo que ya hay: mismo instante (al segundo) y
 * misma posición (≈ 1 m). Sirve también para copias de Flutter, que no traen `uuid`.
 */
export function waypointDedupeKey(w: Pick<WaypointInput, 'recordedAt' | 'lat' | 'lon'>): string {
  return `${Math.round(w.recordedAt / 1000)}|${w.lat.toFixed(5)}|${w.lon.toFixed(5)}`
}

/** Registros de la copia que todavía no están (por `uuid` o por clave de posición e instante). */
export function newRecordsForMerge(existing: readonly Waypoint[], incoming: readonly ParsedBackupRecord[]): ParsedBackupRecord[] {
  const ids = new Set(existing.map((w) => w.id))
  const keys = new Set(existing.map(waypointDedupeKey))
  const out: ParsedBackupRecord[] = []
  for (const r of incoming) {
    const key = waypointDedupeKey(r.input)
    if ((r.uuid && ids.has(r.uuid)) || keys.has(key)) continue
    keys.add(key)
    out.push(r)
  }
  return out
}
