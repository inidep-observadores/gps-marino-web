import { describe, expect, it } from 'vitest'
import {
  ASSUMED_SPEED_KN,
  assumeTimes,
  cumulativeNm,
  defaultPlaybackSpeed,
  detectTrackFormat,
  indexAt,
  parseTimeValue,
  parseTrackDbf,
  parseTrackGeoJson,
  positionAt,
  splitAt,
  TrackFormatError,
  trackToGeoJson,
  trackDistanceNm,
  type TrackPoint,
} from '../src'

/** Arma un DBF mínimo (dBase III) con campos de texto. */
function dbf(cols: { name: string; len: number }[], rows: string[][]): Uint8Array {
  const headerLen = 32 + cols.length * 32 + 1
  const recLen = 1 + cols.reduce((s, c) => s + c.len, 0)
  const out = new Uint8Array(headerLen + rows.length * recLen + 1)
  const v = new DataView(out.buffer)
  out[0] = 3
  v.setUint32(4, rows.length, true)
  v.setUint16(8, headerLen, true)
  v.setUint16(10, recLen, true)
  cols.forEach((c, i) => {
    const o = 32 + i * 32
    for (let k = 0; k < c.name.length; k++) out[o + k] = c.name.charCodeAt(k)
    out[o + 11] = 'C'.charCodeAt(0)
    out[o + 16] = c.len
  })
  out[32 + cols.length * 32] = 0x0d
  rows.forEach((r, i) => {
    let o = headerLen + i * recLen
    out[o++] = 0x20
    r.forEach((cell, k) => {
      for (let j = 0; j < cols[k]!.len; j++) out[o + j] = j < cell.length ? cell.charCodeAt(j) : 0x20
      o += cols[k]!.len
    })
  })
  return out
}

const COLS = [
  { name: 'Buque', len: 12 },
  { name: 'Fecha', len: 19 },
  { name: 'Latitud', len: 14 },
  { name: 'Longitud', len: 14 },
  { name: 'Velocidad', len: 6 },
  { name: 'Rumbo', len: 4 },
]

describe('parseTimeValue', () => {
  it('entiende ISO, segundos y milisegundos', () => {
    expect(parseTimeValue('2026-10-22T18:11:00Z')).toBe(Date.UTC(2026, 9, 22, 18, 11))
    expect(parseTimeValue(1_700_000_000)).toBe(1_700_000_000_000)
    expect(parseTimeValue(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(parseTimeValue('"x"')).toBeNull()
    expect(parseTimeValue(null)).toBeNull()
  })
  it('la hora sin zona se toma en la del dispositivo', () => {
    expect(parseTimeValue('2026-10-22 18:11:00')).toBe(new Date(2026, 9, 22, 18, 11, 0).getTime())
  })
})

describe('detectTrackFormat', () => {
  it('por extensión', () => {
    expect(detectTrackFormat('a.geojson')).toBe('geojson')
    expect(detectTrackFormat('A.JSON')).toBe('geojson')
    expect(detectTrackFormat('a.gpx')).toBe('gpx')
    expect(detectTrackFormat('T1.dbf')).toBe('dbf')
    expect(detectTrackFormat('a.txt')).toBeNull()
  })
})

describe('parseTrackGeoJson', () => {
  const line = (extra: object = {}) => ({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { description: 'ANDRES JORGE - Marea 166/2026', ...extra }, geometry: { type: 'LineString', coordinates: [[-57.5, -38], [-57.4, -38.1], [-57.3, -38.2]] } }],
  })
  it('línea sin horas: se reparten a velocidad supuesta', () => {
    const [t] = parseTrackGeoJson(JSON.stringify(line()), 1_000_000)
    expect(t!.timed).toBe(false)
    expect(t!.name).toBe('ANDRES JORGE - Marea 166/2026')
    expect(t!.points).toHaveLength(3)
    expect(t!.points[0]!.t).toBe(1_000_000)
    const hours = (t!.points[2]!.t - t!.points[0]!.t) / 3_600_000
    expect(trackDistanceNm(t!.points) / hours).toBeCloseTo(ASSUMED_SPEED_KN, 1)
  })
  it('sin horas, usa el inicio (y el fin si lo declara) del archivo', () => {
    const [a] = parseTrackGeoJson(JSON.stringify(line({ fechaInicio: '2026-10-24T00:00:00', fechaFin: null })), 5)
    expect(a!.points[0]!.t).toBe(new Date(2026, 9, 24).getTime())
    expect(a!.timed).toBe(false)
    const [b] = parseTrackGeoJson(JSON.stringify(line({ fechaInicio: '2026-10-24T00:00:00', fechaFin: '2026-10-26T00:00:00' })), 5)
    expect(b!.points[2]!.t).toBe(new Date(2026, 9, 26).getTime())
    expect(b!.points[1]!.t).toBeGreaterThan(b!.points[0]!.t)
  })
  it('usa las horas de coordTimes y coordinateProperties.times', () => {
    const times = ['2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', '2026-01-01T02:00:00Z']
    for (const extra of [{ coordTimes: times }, { coordinateProperties: { times } }]) {
      const [t] = parseTrackGeoJson(JSON.stringify(line(extra)))
      expect(t!.timed).toBe(true)
      expect(t!.points[2]!.t - t!.points[0]!.t).toBe(2 * 3_600_000)
    }
  })
  it('puntos sueltos con hora forman la derrota, ordenados', () => {
    const f = (lon: number, time: string) => ({ type: 'Feature', properties: { time }, geometry: { type: 'Point', coordinates: [lon, -38] } })
    const [t] = parseTrackGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [f(-57.2, '2026-01-01T02:00:00Z'), f(-57.4, '2026-01-01T00:00:00Z'), f(-57.3, '2026-01-01T01:00:00Z')] }))
    expect(t!.points.map((p) => p.lon)).toEqual([-57.4, -57.3, -57.2])
  })
  it('puntos con fecha, hora, velocidad y rumbo completos', () => {
    const f = (lon: number, props: object) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, -38] } })
    const [tr] = parseTrackGeoJson(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          f(-57.4, { fecha: '2026-01-01', hora: '00:00:00', velocidad: 0, rumbo: 90 }),
          f(-57.3, { fecha: '2026-01-01', hora: '01:00:00', velocidad: '6.5', rumbo: '95' }),
        ],
      }),
    )
    expect(tr!.timed).toBe(true)
    expect(tr!.points[1]).toMatchObject({ speedKn: 6.5, courseDeg: 95 })
    expect(tr!.points[1]!.t - tr!.points[0]!.t).toBe(3_600_000)
  })
  it('línea con series de horas, velocidades y rumbos', () => {
    const g = line({ coordTimes: ['2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', '2026-01-01T02:00:00Z'], speeds: [5, 6, 7], coordinateProperties: { courses: [10, 20, 30] } })
    const [tr] = parseTrackGeoJson(JSON.stringify(g))
    expect(tr!.points.map((p) => p.speedKn)).toEqual([5, 6, 7])
    expect(tr!.points.map((p) => p.courseDeg)).toEqual([10, 20, 30])
  })
  it('MultiLineString se junta en una derrota', () => {
    const g = { type: 'MultiLineString', coordinates: [[[-57, -38], [-57.1, -38]], [[-57.2, -38], [-57.3, -38]]] }
    expect(parseTrackGeoJson(JSON.stringify(g))[0]!.points).toHaveLength(4)
  })
  it('errores', () => {
    expect(() => parseTrackGeoJson('{no')).toThrow(TrackFormatError)
    expect(() => parseTrackGeoJson('{"type":"FeatureCollection","features":[]}')).toThrow(TrackFormatError)
  })
})

describe('parseTrackDbf', () => {
  it('lee fecha, posición, velocidad y rumbo', () => {
    const bytes = dbf(COLS, [
      ['ANDRES', '2026-10-22 18:26:00', '-38.1000000000', '-57.5000000000', '7.50', '170'],
      ['ANDRES', '2026-10-22 18:11:00', '-38.0450000000', '-57.5375000000', '0.00', '205'],
    ])
    const t = parseTrackDbf(bytes)!
    expect(t.timed).toBe(true)
    expect(t.name).toBe('ANDRES')
    expect(t.points[0]).toMatchObject({ lat: -38.045, speedKn: 0, courseDeg: 205 })
    expect(t.points[1]).toMatchObject({ lat: -38.1, lon: -57.5, speedKn: 7.5, courseDeg: 170 })
    expect(t.points[1]!.t - t.points[0]!.t).toBe(15 * 60_000)
  })
  it('sin columnas de posición no es una derrota; truncado es error', () => {
    expect(parseTrackDbf(dbf([{ name: 'Otro', len: 4 }], [['x']]))).toBeNull()
    expect(() => parseTrackDbf(new Uint8Array(10))).toThrow(TrackFormatError)
  })
})

describe('trackToGeoJson', () => {
  it('se importa de vuelta con hora, velocidad y rumbo', () => {
    const pts: TrackPoint[] = [
      { t: Date.UTC(2026, 0, 1, 0, 0, 0), lat: -38, lon: -57.5, speedKn: 0, courseDeg: 90 },
      { t: Date.UTC(2026, 0, 1, 1, 0, 0), lat: -38.1, lon: -57.4, speedKn: 6.25, courseDeg: null },
    ]
    const [t] = parseTrackGeoJson(trackToGeoJson('Mi derrota', pts))
    expect(t!.name).toBe('Mi derrota')
    expect(t!.timed).toBe(true)
    expect(t!.points).toEqual(pts.map((p) => ({ ...p, lat: Number(p.lat.toFixed(7)), lon: Number(p.lon.toFixed(7)) })))
  })
})

describe('reproducción', () => {
  const H = 3_600_000
  const pts: TrackPoint[] = [
    { t: 0, lat: 0, lon: 0, speedKn: null, courseDeg: null },
    { t: H, lat: 0, lon: 1 / 60, speedKn: null, courseDeg: null }, // 1 Nm al este en 1 h
    { t: 2 * H, lat: 1 / 60, lon: 1 / 60, speedKn: null, courseDeg: null }, // 1 Nm al norte
  ]
  const cum = cumulativeNm(pts)
  it('indexAt', () => {
    expect(indexAt(pts, -5)).toBe(0)
    expect(indexAt(pts, H)).toBe(1)
    expect(indexAt(pts, 1.5 * H)).toBe(1)
    expect(indexAt(pts, 9 * H)).toBe(2)
  })
  it('interpola posición, rumbo, distancia y velocidad', () => {
    const p = positionAt(pts, cum, 0.5 * H)!
    expect(p.lon).toBeCloseTo(0.5 / 60, 6)
    expect(p.courseDeg).toBeCloseTo(90, 0)
    expect(p.distanceNm).toBeCloseTo(0.5, 2)
    expect(p.speedKn).toBeCloseTo(1, 1)
    expect(positionAt(pts, cum, 1.5 * H)!.courseDeg).toBeCloseTo(0, 0)
    expect(positionAt(pts, cum, 99 * H)!.distanceNm).toBeCloseTo(2, 2)
    expect(positionAt([], [], 0)).toBeNull()
  })
  it('parado: conserva el último rumbo y no salta', () => {
    const still: TrackPoint[] = [...pts, { ...pts[2]!, t: 3 * H }]
    const p = positionAt(still, cumulativeNm(still), 2.5 * H)!
    expect(p.courseDeg).toBeCloseTo(0, 0)
    expect(p.lat).toBeCloseTo(1 / 60, 6)
  })
  it('cruce de ±180° sin saltos', () => {
    const a: TrackPoint[] = [
      { t: 0, lat: 0, lon: 179.9, speedKn: null, courseDeg: null },
      { t: H, lat: 0, lon: -179.9, speedKn: null, courseDeg: null },
    ]
    const p = positionAt(a, cumulativeNm(a), 0.5 * H)!
    expect(Math.abs(p.lon)).toBeGreaterThan(179.9)
  })
  it('splitAt: lo recorrido y lo que falta comparten el buque', () => {
    const p = positionAt(pts, cum, 1.5 * H)!
    const s = splitAt(pts, p)
    expect(s.done).toHaveLength(3)
    expect(s.rest).toHaveLength(2)
    expect(s.done[s.done.length - 1]).toEqual(s.rest[0])
  })
  it('velocidad inicial razonable', () => {
    expect(defaultPlaybackSpeed(10 * 60_000)).toBe(10)
    expect(defaultPlaybackSpeed(60_000)).toBe(4)
    expect(defaultPlaybackSpeed(28 * 24 * H)).toBe(21600)
    expect(defaultPlaybackSpeed(1e12)).toBe(86400)
  })
  it('assumeTimes: reparte por distancia', () => {
    const t = assumeTimes([{ lat: 0, lon: 0, speedKn: null, courseDeg: null }, { lat: 0, lon: 8 / 60, speedKn: null, courseDeg: null }], 0, 8)
    expect(Math.abs(t[1]!.t - H)).toBeLessThan(10_000) // la esfera de la app mide 1′ ≈ 1,0007 Nm
  })
})
