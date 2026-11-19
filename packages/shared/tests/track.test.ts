import { describe, expect, it } from 'vitest'
import { DEFAULT_RECORD_RULES, destinationPoint, distanceNm, shouldRecord, trackDistanceNm, trackStats, trackToGpx, type TrackPoint } from '../src'

const A = { lat: -38, lon: -57.5 }
const pt = (over: Partial<TrackPoint> = {}): TrackPoint => ({ ...A, t: 0, speedKn: 6, courseDeg: 90, ...over })

describe('cuándo grabar un punto', () => {
  const last = pt({ t: 10_000 })

  it('el primero siempre; precisión mala, no', () => {
    expect(shouldRecord(null, pt(), 5)).toBe(true)
    expect(shouldRecord(null, pt(), 80)).toBe(false)
  })

  it('por distancia (20 m) y con un mínimo de 3 s entre puntos', () => {
    const far = { ...destinationPoint(A, 90, 30 / 1852), t: 20_000, speedKn: 6, courseDeg: 90 }
    expect(shouldRecord(last, far, 5)).toBe(true)
    expect(shouldRecord(last, { ...far, t: 11_000 }, 5)).toBe(false) // muy seguido
    const near = { ...destinationPoint(A, 90, 10 / 1852), t: 20_000, speedKn: 6, courseDeg: 90 }
    expect(shouldRecord(last, near, 5)).toBe(false)
  })

  it('en una curva graba con menos distancia', () => {
    const turn = { ...destinationPoint(A, 90, 10 / 1852), t: 20_000, speedKn: 6, courseDeg: 130 }
    expect(shouldRecord(last, turn, 5)).toBe(true)
    const tiny = { ...destinationPoint(A, 90, 3 / 1852), t: 20_000, speedKn: 6, courseDeg: 130 }
    expect(shouldRecord(last, tiny, 5)).toBe(false)
    expect(DEFAULT_RECORD_RULES.minDistanceM).toBe(20)
  })
})

describe('distancia, estadísticas y GPX', () => {
  const p1 = pt({ t: 0 })
  const p2 = pt({ ...destinationPoint(A, 90, 3), t: 30 * 60_000, speedKn: 7 })
  const p3 = pt({ ...destinationPoint(destinationPoint(A, 90, 3), 0, 3), t: 60 * 60_000, speedKn: 4 })

  it('suma los tramos', () => {
    expect(trackDistanceNm([p1, p2, p3])).toBeCloseTo(distanceNm(p1, p2) + distanceNm(p2, p3), 9)
    expect(trackDistanceNm([p1])).toBe(0)
  })

  it('velocidad media = distancia / tiempo; máxima de las informadas', () => {
    const s = trackStats([p1, p2, p3])
    expect(s.durationMs).toBe(3_600_000)
    expect(s.avgSpeedKn).toBeCloseTo(s.distanceNm, 6) // 1 hora
    expect(s.maxSpeedKn).toBe(7)
    expect(trackStats([p1]).avgSpeedKn).toBeNull()
  })

  it('GPX con un track, un segmento y la hora de cada punto', () => {
    const gpx = trackToGpx('Derrota <1> & Co', [p1, p2])
    expect(gpx).toContain('<name>Derrota &lt;1&gt; &amp; Co</name>')
    expect(gpx.match(/<trkpt /g)).toHaveLength(2)
    expect(gpx.match(/<trkseg>/g)).toHaveLength(1)
    expect(gpx).toContain('<time>1970-01-01T00:00:00Z</time>')
  })
})
