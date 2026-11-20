import { angleDiff, distanceM, METERS_PER_NM, type LatLon } from './geo'

/**
 * Registro de derrota (track): la línea que recorre el buque. Se graba cada posición "que valga la pena" (no una por
 * segundo): sirve para dibujar el recorrido, medirlo y exportarlo, y mantiene chica la base en un teléfono.
 */
export interface TrackPoint extends LatLon {
  /** Instante (ms UTC). */
  t: number
  speedKn: number | null
  courseDeg: number | null
}

export interface RecordRules {
  /** Distancia mínima (m) para grabar otro punto. */
  minDistanceM: number
  /** Si el rumbo cambió más que esto (°), se graba con una distancia menor (`turnMinDistanceM`): las curvas se dibujan bien. */
  turnDeg: number
  turnMinDistanceM: number
  /** Tiempo mínimo entre puntos (ms). */
  minIntervalMs: number
  /** Precisión peor que esto (m): la posición se descarta. */
  maxAccuracyM: number
}

export const DEFAULT_RECORD_RULES: RecordRules = {
  minDistanceM: 20,
  turnDeg: 20,
  turnMinDistanceM: 8,
  minIntervalMs: 3000,
  maxAccuracyM: 50,
}

/** ¿Hay que grabar este punto, dado el último grabado? */
export function shouldRecord(last: TrackPoint | null, fix: TrackPoint, accuracyM: number, rules: RecordRules = DEFAULT_RECORD_RULES): boolean {
  if (accuracyM > rules.maxAccuracyM) return false
  if (!last) return true
  if (fix.t - last.t < rules.minIntervalMs) return false
  const d = distanceM(last, fix)
  if (d >= rules.minDistanceM) return true
  const turned = last.courseDeg != null && fix.courseDeg != null && angleDiff(last.courseDeg, fix.courseDeg) >= rules.turnDeg
  return turned && d >= rules.turnMinDistanceM
}

/** Distancia recorrida (Nm). */
export function trackDistanceNm(points: readonly LatLon[]): number {
  let m = 0
  for (let i = 1; i < points.length; i++) m += distanceM(points[i - 1]!, points[i]!)
  return m / METERS_PER_NM
}

export interface TrackStats {
  distanceNm: number
  durationMs: number
  /** Velocidad media (kn) = distancia / duración. */
  avgSpeedKn: number | null
  maxSpeedKn: number | null
}

export function trackStats(points: readonly TrackPoint[]): TrackStats {
  const distanceNm = trackDistanceNm(points)
  const durationMs = points.length > 1 ? points[points.length - 1]!.t - points[0]!.t : 0
  const speeds = points.map((p) => p.speedKn).filter((v): v is number => v != null)
  return {
    distanceNm,
    durationMs,
    avgSpeedKn: durationMs > 0 ? distanceNm / (durationMs / 3_600_000) : null,
    maxSpeedKn: speeds.length ? Math.max(...speeds) : null,
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

/**
 * GeoJSON con toda la información de la derrota: una línea más las series de hora (ISO), velocidad (nudos) y rumbo (grados)
 * de cada punto, en el formato que `parseTrackGeoJson` lee de vuelta (y que otros programas ignoran sin problema).
 */
export function trackToGeoJson(name: string, points: readonly TrackPoint[]): string {
  const round = (v: number | null, d: number) => (v == null ? null : Number(v.toFixed(d)))
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name,
          fechaInicio: points.length ? iso(points[0]!.t) : null,
          fechaFin: points.length ? iso(points[points.length - 1]!.t) : null,
          coordTimes: points.map((p) => iso(p.t)),
          speeds: points.map((p) => round(p.speedKn, 2)),
          courses: points.map((p) => round(p.courseDeg, 0)),
        },
        geometry: { type: 'LineString', coordinates: points.map((p) => [Number(p.lon.toFixed(7)), Number(p.lat.toFixed(7))]) },
      },
    ],
  })
}

/** GPX 1.1 con un `<trk>` de un solo segmento: lo abren los plotters, Google Earth, OpenCPN, etc. */
export function trackToGpx(name: string, points: readonly TrackPoint[]): string {
  const pts = points
    .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><time>${iso(p.t)}</time></trkpt>`)
    .join('\n')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="GPS Marino Web" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata><name>${esc(name)}</name></metadata>\n` +
    `  <trk>\n    <name>${esc(name)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n`
  )
}
