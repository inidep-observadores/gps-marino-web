import { distanceM, METERS_PER_NM } from './geo'
import type { TrackPoint } from './track'
import type { XmlParser } from './layers'

/**
 * Importar derrotas de archivos GeoJSON, GPX o DBF (tabla de posiciones de un shapefile, con hora, velocidad y rumbo de cada punto). Una derrota es una línea con
 * las horas de cada punto; si el archivo no trae horas se reparten a `ASSUMED_SPEED_KN` para poder reproducirla.
 * Puro: sin red ni DOM (el GPX recibe el parser XML inyectado, como las capas).
 *
 * Las horas sin zona horaria ("2026-10-22 18:11:00") se toman en la hora del dispositivo, así se ven igual que en el archivo.
 */
export interface ImportedTrack {
  /** Nombre que trae el archivo (puede faltar). */
  name: string | null
  points: TrackPoint[]
  /** `false` si el archivo no traía horas y se inventaron a `ASSUMED_SPEED_KN`. */
  timed: boolean
}

export type TrackFileFormat = 'geojson' | 'gpx' | 'dbf'

export class TrackFormatError extends Error {
  constructor(readonly code: 'invalid-json' | 'invalid-xml' | 'not-gpx' | 'invalid-dbf' | 'no-tracks') {
    super(code)
  }
}

/** Velocidad con la que se reparten las horas de una derrota sin horas (nudos). */
export const ASSUMED_SPEED_KN = 8

export function detectTrackFormat(fileName: string): TrackFileFormat | null {
  if (/\.(geo)?json$/i.test(fileName)) return 'geojson'
  if (/\.gpx$/i.test(fileName)) return 'gpx'
  if (/\.dbf$/i.test(fileName)) return 'dbf'
  return null
}

/** Instante (ms) de un valor de fecha: ISO, segundos o milisegundos epoch; `null` si no se entiende. */
export function parseTimeValue(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1e11 ? Math.round(v * 1000) : Math.round(v)
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return parseTimeValue(n)
    const ms = Date.parse(v.trim().replace(' ', 'T'))
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

const validLonLat = (lon: unknown, lat: unknown): boolean =>
  typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

/** Pone horas a velocidad constante desde `startMs` (derrotas sin horas). */
export function assumeTimes(points: Omit<TrackPoint, 't'>[], startMs: number, speedKn = ASSUMED_SPEED_KN): TrackPoint[] {
  let t = startMs
  return points.map((p, i) => {
    if (i > 0) t += (distanceM(points[i - 1]!, p) / METERS_PER_NM / speedKn) * 3_600_000
    return { ...p, t: Math.round(t) }
  })
}

/** Las horas nunca retroceden (un punto con hora anterior a la previa se alinea con ella). */
function monotonic(points: TrackPoint[]): TrackPoint[] {
  let last = -Infinity
  return points.map((p) => {
    last = Math.max(last, p.t)
    return p.t === last ? p : { ...p, t: last }
  })
}

interface Raw {
  lat: number
  lon: number
  t: number | null
  speedKn?: number | null
  courseDeg?: number | null
}

/** Reparte las horas entre `startMs` y `endMs` en proporción a la distancia recorrida (derrota sin horas pero con inicio y fin). */
function spreadTimes(points: Omit<TrackPoint, 't'>[], startMs: number, endMs: number): TrackPoint[] {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + distanceM(points[i - 1]!, points[i]!))
  const total = cum[cum.length - 1]!
  return points.map((p, i) => ({ ...p, t: Math.round(startMs + (total > 0 ? cum[i]! / total : i / (points.length - 1)) * (endMs - startMs)) }))
}

/** Inicio y fin de la derrota que declaran las propiedades del archivo (`fechaInicio`/`fechaFin`, `start`/`end`...). */
function declaredSpan(props: Json): { start: number | null; end: number | null } {
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const t = parseTimeValue(props[k])
      if (t != null) return t
    }
    return null
  }
  return { start: pick(['fechaInicio', 'startTime', 'start', 'inicio']), end: pick(['fechaFin', 'endTime', 'end', 'fin']) }
}

function build(raw: Raw[], fallbackStartMs: number, name: string | null, span?: { start: number | null; end: number | null }): ImportedTrack | null {
  if (raw.length < 2) return null
  const timed = raw.every((r) => r.t != null)
  const base = raw.map((r) => ({ lat: r.lat, lon: r.lon, speedKn: r.speedKn ?? null, courseDeg: r.courseDeg ?? null }))
  if (timed) return { name, points: monotonic(raw.map((r, i) => ({ ...base[i]!, t: r.t! }))), timed }
  const start = span?.start ?? fallbackStartMs
  const points = span?.end != null && span.end > start ? spreadTimes(base, start, span.end) : assumeTimes(base, start)
  return { name, points, timed }
}

// ---------------------------------------------------------------------------------------------------------------
// GeoJSON

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Horas por coordenada según las convenciones más comunes (togeojson, Mapbox, exportadores propios). */
function timesFor(props: Json, feature: Json, n: number): (number | null)[] | null {
  const cp = isObj(props.coordinateProperties) ? props.coordinateProperties : isObj(feature.coordinateProperties) ? feature.coordinateProperties : null
  const candidates = [props.coordTimes, props.times, props.timestamps, cp?.times, cp?.timestamps]
  for (const c of candidates) {
    if (!Array.isArray(c)) continue
    const flat = (c as unknown[]).flat(2)
    if (flat.length === n) return flat.map(parseTimeValue)
  }
  return null
}

function lineCoords(geometry: unknown): unknown[][] | null {
  if (!isObj(geometry)) return null
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) return geometry.coordinates as unknown[][]
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) return (geometry.coordinates as unknown[][][]).flat()
  return null
}

const TIME_KEYS = ['time', 'timestamp', 'datetime', 'date', 'fecha', 'fechaHora', 'recordedAt', 't', 'ts']
const SPEED_KEYS = ['speedKn', 'speed', 'sog', 'velocidad', 'vel']
const COURSE_KEYS = ['courseDeg', 'course', 'cog', 'heading', 'rumbo', 'bearing']
/** Primer valor numérico de las claves dadas (la velocidad se toma en nudos, el rumbo en grados). */
function pick(props: Json, keys: string[]): number | null {
  for (const k of keys) {
    const v = props[k]
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    if (Number.isFinite(n)) return n
  }
  return null
}
function pointTime(props: Json): number | null {
  // Fecha y hora en campos separados ("fecha": "2026-10-22", "hora": "18:11:00"): primero, porque la fecha sola también se entiende.
  const d = typeof props.fecha === 'string' ? props.fecha : typeof props.date === 'string' ? props.date : null
  const h = typeof props.hora === 'string' ? props.hora : null
  if (d && h) {
    const t = parseTimeValue(`${d.trim()}T${h.trim()}`)
    if (t != null) return t
  }
  for (const k of TIME_KEYS) {
    const t = parseTimeValue(props[k])
    if (t != null) return t
  }
  return null
}

/** Serie numérica por coordenada (velocidades, rumbos) en las propiedades de una línea; `null` si no hay una del largo justo. */
function seriesFor(props: Json, feature: Json, n: number, keys: string[]): (number | null)[] | null {
  const cp = isObj(props.coordinateProperties) ? props.coordinateProperties : isObj(feature.coordinateProperties) ? feature.coordinateProperties : null
  for (const k of keys) {
    for (const c of [props[k], props[`${k}s`], cp?.[k], cp?.[`${k}s`]]) {
      if (Array.isArray(c) && c.length === n) return c.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null))
    }
  }
  return null
}

/** Nombre de una derrota a partir de las propiedades de su línea (`name`, `title` o `description`). */
const featureName = (props: Json) => str(props.name) ?? str(props.title) ?? str(props.description)

export function parseTrackGeoJson(text: string, fallbackStartMs = Date.now()): ImportedTrack[] {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    throw new TrackFormatError('invalid-json')
  }
  const features: Json[] = []
  const collect = (node: unknown) => {
    if (!isObj(node)) return
    if (node.type === 'FeatureCollection' && Array.isArray(node.features)) node.features.forEach(collect)
    else if (node.type === 'Feature') features.push(node)
    else if (node.type === 'GeometryCollection' && Array.isArray(node.geometries)) node.geometries.forEach((g) => features.push({ type: 'Feature', properties: {}, geometry: g }))
    else if (typeof node.type === 'string') features.push({ type: 'Feature', properties: {}, geometry: node })
  }
  collect(data)
  const docName = isObj(data) ? str(data.name) : null

  const out: ImportedTrack[] = []
  const loose: Raw[] = []
  for (const f of features) {
    const props = isObj(f.properties) ? f.properties : {}
    const name = featureName(props) ?? docName
    const coords = lineCoords(f.geometry)
    if (coords) {
      const valid = coords.filter((c) => Array.isArray(c) && validLonLat(c[0], c[1]))
      if (valid.length !== coords.length) continue // coordenadas rotas: sus horas ya no coincidirían
      const times = timesFor(props, f, valid.length)
      const speeds = seriesFor(props, f, valid.length, SPEED_KEYS)
      const courses = seriesFor(props, f, valid.length, COURSE_KEYS)
      const t = build(
        valid.map((c, i) => ({ lon: c[0] as number, lat: c[1] as number, t: times?.[i] ?? null, speedKn: speeds?.[i] ?? null, courseDeg: courses?.[i] ?? null })),
        fallbackStartMs,
        name,
        declaredSpan(props),
      )
      if (t) out.push(t)
    } else if (isObj(f.geometry) && f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
      const [lon, lat] = f.geometry.coordinates as number[]
      if (validLonLat(lon, lat)) loose.push({ lon: lon!, lat: lat!, t: pointTime(props), speedKn: pick(props, SPEED_KEYS), courseDeg: pick(props, COURSE_KEYS) })
    }
  }
  // Sin líneas, una sucesión de puntos con hora (un punto por posición) forma la derrota.
  if (!out.length && loose.length >= 2) {
    if (loose.every((p) => p.t != null)) loose.sort((a, b) => a.t! - b.t!)
    const t = build(loose, fallbackStartMs, docName)
    if (t) out.push(t)
  }
  if (!out.length) throw new TrackFormatError('no-tracks')
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// GPX

const lname = (el: Element) => (el.localName ?? el.nodeName).replace(/^.*:/, '')
function kids(el: Element, name: string): Element[] {
  const out: Element[] = []
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && lname(n as Element) === name) out.push(n as Element)
  return out
}
const kidText = (el: Element, name: string) => str(kids(el, name)[0]?.textContent)

export function parseTrackGpx(xml: string, parseXml: XmlParser, fallbackStartMs = Date.now()): ImportedTrack[] {
  let doc: Document
  try {
    doc = parseXml(xml.replace(/^﻿/, ''))
  } catch {
    throw new TrackFormatError('invalid-xml')
  }
  const root = doc.documentElement
  if (!root || lname(root) !== 'gpx') throw new TrackFormatError('not-gpx')
  const rawOf = (pts: Element[], withTime: boolean): Raw[] => {
    const raw: Raw[] = []
    for (const el of pts) {
      const lat = Number(el.getAttribute('lat'))
      const lon = Number(el.getAttribute('lon'))
      if (validLonLat(lon, lat)) raw.push({ lat, lon, t: withTime ? parseTimeValue(kidText(el, 'time')) : null })
    }
    return raw
  }
  const out: ImportedTrack[] = []
  for (const trk of kids(root, 'trk')) {
    const raw = kids(trk, 'trkseg').flatMap((seg) => rawOf(kids(seg, 'trkpt'), true))
    const t = build(raw, fallbackStartMs, kidText(trk, 'name'))
    if (t) out.push(t)
  }
  // Las rutas planificadas (`rte`) no tienen horas: se reproducen a velocidad supuesta.
  for (const rte of kids(root, 'rte')) {
    const t = build(rawOf(kids(rte, 'rtept'), false), fallbackStartMs, kidText(rte, 'name'))
    if (t) out.push(t)
  }
  if (!out.length) throw new TrackFormatError('no-tracks')
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// DBF (tabla de atributos de un shapefile): una fila por posición, con fecha, latitud, longitud, velocidad y rumbo.

const latin1 = (b: Uint8Array, from: number, to: number) => {
  let s = ''
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i]!)
  return s.trim()
}

/** Columnas conocidas (sin distinguir mayúsculas ni idioma). */
const DBF_COLS = {
  t: ['fecha', 'fechahora', 'datetime', 'time', 'date'],
  lat: ['latitud', 'lat', 'latitude'],
  lon: ['longitud', 'lon', 'lng', 'longitude'],
  speed: ['velocidad', 'vel', 'speed', 'sog'],
  course: ['rumbo', 'course', 'cog', 'heading'],
  name: ['buque', 'nombre', 'name'],
} as const

/** Derrota de una tabla DBF; `null` si no tiene columnas de latitud y longitud. Las filas se ordenan por hora. */
export function parseTrackDbf(bytes: Uint8Array): ImportedTrack | null {
  if (bytes.length < 33) throw new TrackFormatError('invalid-dbf')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(4, true)
  const headerLen = view.getUint16(8, true)
  const recLen = view.getUint16(10, true)
  if (!recLen || headerLen + count * recLen > bytes.length + recLen) throw new TrackFormatError('invalid-dbf')

  const fields: { name: string; len: number; off: number }[] = []
  let p = 1
  for (let o = 32; o < headerLen && bytes[o] !== 0x0d; o += 32) {
    const len = bytes[o + 16]!
    fields.push({ name: latin1(bytes, o, o + 11).replace(/ .*$/, '').toLowerCase(), len, off: p })
    p += len
  }
  const col = (keys: readonly string[]) => fields.find((f) => keys.includes(f.name))
  const cT = col(DBF_COLS.t)
  const cLat = col(DBF_COLS.lat)
  const cLon = col(DBF_COLS.lon)
  if (!cLat || !cLon) return null
  const cSpeed = col(DBF_COLS.speed)
  const cCourse = col(DBF_COLS.course)
  const cName = col(DBF_COLS.name)

  const raw: Raw[] = []
  let name: string | null = null
  for (let i = 0; i < count; i++) {
    const base = headerLen + i * recLen
    if (bytes[base] === 0x2a) continue // registro borrado
    const cell = (c: { len: number; off: number }) => latin1(bytes, base + c.off, base + c.off + c.len)
    const lat = Number(cell(cLat))
    const lon = Number(cell(cLon))
    if (!validLonLat(lon, lat)) continue
    const num = (c?: { len: number; off: number }) => {
      if (!c) return null
      const v = cell(c)
      return v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
    }
    raw.push({ lat, lon, t: cT ? parseTimeValue(cell(cT)) : null, speedKn: num(cSpeed), courseDeg: num(cCourse) })
    if (cName && !name) name = cell(cName) || null
  }
  if (cT) raw.sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
  return build(raw, Date.now(), name)
}
