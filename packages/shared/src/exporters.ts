import type { Waypoint } from './domain'
import { formatBearing, formatLat, formatLon } from './format'

/**
 * Exportación de ubicaciones a formatos de otras apps:
 * - GPX 1.1 (GPS genéricos, plotters, apps de navegación): un `<wpt>` por ubicación.
 * - KML 2.2 (Google Earth / Google Maps): un `Placemark` por ubicación.
 * - CSV (planillas): columnas en decimales y en grados-minutos, separador coma, UTF-8 con BOM (Excel lo abre bien).
 * La app Flutter exportaba GPX/KML solo con nombre y posición; aquí se suman fecha, velocidad y rumbo.
 */

export interface ExportOptions {
  /** Nombre cuando la ubicación no tiene descripción. */
  fallbackName?: (w: Waypoint) => string
  /** Nombre del documento (KML/GPX). */
  title?: string
}

const escXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

const nameOf = (w: Waypoint, opts: ExportOptions) => w.description.trim() || opts.fallbackName?.(w) || iso(w.recordedAt)

const detail = (w: Waypoint) => `${w.speedKn.toFixed(1)} kn · ${formatBearing(w.bearing)}`

export function toGpx(list: readonly Waypoint[], opts: ExportOptions = {}): string {
  const wpts = list
    .map(
      (w) =>
        `  <wpt lat="${w.lat.toFixed(7)}" lon="${w.lon.toFixed(7)}">\n` +
        `    <time>${iso(w.recordedAt)}</time>\n` +
        `    <name>${escXml(nameOf(w, opts))}</name>\n` +
        `    <desc>${escXml(detail(w))}</desc>\n` +
        `  </wpt>`,
    )
    .join('\n')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="GPS Marino Web" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata><name>${escXml(opts.title ?? 'MogData')}</name><time>${iso(Date.now())}</time></metadata>\n` +
    `${wpts}\n</gpx>\n`
  )
}

export function toKml(list: readonly Waypoint[], opts: ExportOptions = {}): string {
  const marks = list
    .map(
      (w) =>
        `    <Placemark>\n` +
        `      <name>${escXml(nameOf(w, opts))}</name>\n` +
        `      <description>${escXml(`${iso(w.recordedAt)} · ${detail(w)}`)}</description>\n` +
        `      <TimeStamp><when>${iso(w.recordedAt)}</when></TimeStamp>\n` +
        `      <Point><coordinates>${w.lon.toFixed(7)},${w.lat.toFixed(7)},0</coordinates></Point>\n` +
        `    </Placemark>`,
    )
    .join('\n')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${escXml(opts.title ?? 'MogData')}</name>\n` +
    `${marks}\n  </Document>\n</kml>\n`
  )
}

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const CSV_HEADER = [
  'fecha_utc',
  'descripcion',
  'latitud',
  'longitud',
  'latitud_gm',
  'longitud_gm',
  'velocidad_kn',
  'rumbo',
  'icono',
  'color',
  'visible',
] as const

/** CSV con BOM. Coordenadas en decimales (punto) y en grados-minutos (como se ven en la app). */
export function toCsv(list: readonly Waypoint[], opts: { west?: string } = {}): string {
  const rows = list.map((w) =>
    [
      iso(w.recordedAt),
      w.description,
      w.lat.toFixed(7),
      w.lon.toFixed(7),
      formatLat(w.lat),
      formatLon(w.lon, { west: opts.west }),
      w.speedKn.toFixed(2),
      Math.round(w.bearing),
      w.icon,
      w.color,
      w.visible ? 1 : 0,
    ]
      .map(csvCell)
      .join(','),
  )
  return '﻿' + [CSV_HEADER.join(','), ...rows].join('\r\n') + '\r\n'
}
