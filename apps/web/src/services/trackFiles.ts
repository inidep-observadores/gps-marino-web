import { strFromU8, unzipSync } from 'fflate'
import { detectTrackFormat, parseTrackDbf, parseTrackGeoJson, parseTrackGpx, TrackFormatError, type ImportedTrack, type TrackFileFormat } from '@gpsm/shared'

/**
 * Lee archivos de derrotas elegidos por el usuario: GeoJSON, GPX o un ZIP que los contiene (p. ej. el que exporta el
 * sistema de gestión de mareas: un `.geojson` con la línea más archivos de apoyo que se ignoran). Todo en el dispositivo.
 */
export class TrackImportError extends Error {
  constructor(readonly code: 'unsupported' | 'unreadable' | 'noTracks') {
    super(code)
  }
}

const parseXml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')

interface Source {
  fileName: string
  format: TrackFileFormat
  bytes: Uint8Array
}
const textOf = (s: Source) => strFromU8(s.bytes)

async function sources(file: File): Promise<Source[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(bytes, { filter: (f) => detectTrackFormat(f.name) != null && !f.name.startsWith('__MACOSX') })
    } catch {
      throw new TrackImportError('unreadable')
    }
    // Primero el .dbf (trae hora, velocidad y rumbo de cada punto), luego .geojson / .gpx (un .json suelto suele ser otra cosa, como los datos de la marea).
    const rank = (n: string) => (/\.dbf$/i.test(n) ? -1 : /\.json$/i.test(n) && !/\.geojson$/i.test(n) ? 1 : 0)
    return Object.keys(entries)
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((n) => ({ fileName: n, format: detectTrackFormat(n)!, bytes: entries[n]! }))
  }
  const format = detectTrackFormat(file.name)
  if (!format) throw new TrackImportError('unsupported')
  return [{ fileName: file.name, format, bytes }]
}

/** Nombre por defecto: el del archivo sin extensión (sin la carpeta del ZIP). */
export const trackNameFromFile = (fileName: string) =>
  (fileName.split(/[\\/]/).pop() ?? fileName).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()

/** Nombre y propiedades que declara el GeoJSON de apoyo de un ZIP (por si el DBF no los trae). */
function geoJsonName(list: Source[]): string | null {
  for (const s of list) {
    if (s.format !== 'geojson') continue
    try {
      const n = parseTrackGeoJson(textOf(s))[0]?.name
      if (n) return n
    } catch {
      /* no es una derrota: se sigue */
    }
  }
  return null
}

/**
 * Derrotas que contiene el archivo. En un ZIP se toma el primer archivo que tenga una derrota; los que no son derrotas
 * (metadatos .json, etc.) se saltean. Si hay un DBF con las posiciones se prefiere (trae horas, velocidad y rumbo reales;
 * el GeoJSON solo aporta el nombre).
 */
export async function readTrackFile(file: File): Promise<(ImportedTrack & { fileName: string })[]> {
  const list = await sources(file)
  if (!list.length) throw new TrackImportError('noTracks')
  let sawBad = false
  for (const s of list) {
    try {
      if (s.format === 'dbf') {
        const t = parseTrackDbf(s.bytes)
        if (!t) continue
        return [{ ...t, name: geoJsonName(list) ?? t.name, fileName: s.fileName }]
      }
      const tracks = s.format === 'gpx' ? parseTrackGpx(textOf(s), parseXml) : parseTrackGeoJson(textOf(s))
      return tracks.map((t) => ({ ...t, fileName: s.fileName }))
    } catch (e) {
      if (!(e instanceof TrackFormatError)) throw e
      sawBad = true
    }
  }
  throw new TrackImportError(sawBad ? 'noTracks' : 'unreadable')
}
