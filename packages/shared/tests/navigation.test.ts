import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ARRIVAL_SETTINGS,
  angleDiff,
  averageSpeedKn,
  bearingDeg,
  courseOverGround,
  destinationPoint,
  distanceNm,
  etaMs,
  formatBearing,
  formatLat,
  formatLon,
  fromDegMin,
  hasReached,
  normalizeDeg,
  pushSample,
  routeDistanceNm,
  routeLegs,
  stepRoute,
  toDegMin,
  type NavFix,
  type PositionSample,
  type RoutePoint,
} from '../src'

const MDP = { lat: -38.0, lon: -57.55 }
const pt = (name: string, lat: number, lon: number): RoutePoint => ({ name, lat, lon, waypointId: null })

describe('geometría', () => {
  it('un grado de latitud son ~60 Nm', () => {
    expect(distanceNm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(60.04, 1)
  })

  it('rumbos cardinales y normalización', () => {
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(0, 6)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 6)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 6)
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })).toBeCloseTo(270, 6)
    expect(normalizeDeg(-10)).toBe(350)
    expect(normalizeDeg(720)).toBe(0)
    expect(angleDiff(350, 10)).toBe(20)
    expect(angleDiff(90, 270)).toBe(180)
  })

  it('destinationPoint es la inversa de distancia + rumbo', () => {
    const p = destinationPoint(MDP, 135, 12.5)
    expect(distanceNm(MDP, p)).toBeCloseTo(12.5, 6)
    expect(bearingDeg(MDP, p)).toBeCloseTo(135, 3)
  })
})

describe('formatos náuticos (iguales a la app Flutter)', () => {
  it('grados y minutos con tres decimales y hemisferio', () => {
    expect(formatLat(-38.0055)).toBe("38° 00,330' S")
    expect(formatLon(-57.5426)).toBe("57° 32,556' O")
    expect(formatLon(-57.5426, { west: 'W', decimal: '.' })).toBe("57° 32.556' W")
    expect(formatLat(12.5)).toBe("12° 30,000' N")
    expect(formatLat(null)).toBe("--° --,---' -")
    expect(formatLon(undefined)).toBe("---° --,---' -")
  })

  it('redondea con acarreo: 59,9996 minutos pasan al grado siguiente', () => {
    expect(formatLat(-(37 + 59.9996 / 60))).toBe("38° 00,000' S")
    expect(toDegMin(-(37 + 59.9996 / 60))).toEqual({ deg: 38, min: 0, negative: true })
  })

  it('ida y vuelta grados-minutos', () => {
    const { deg, min, negative } = toDegMin(-57.5426)
    expect(fromDegMin(deg, min, negative)).toBeCloseTo(-57.5426, 5)
  })

  it('rumbo con tres cifras', () => {
    expect(formatBearing(5.6)).toBe('006°')
    expect(formatBearing(359.7)).toBe('000°')
    expect(formatBearing(145)).toBe('145°')
    expect(formatBearing(null)).toBe('---')
  })
})

describe('ruta, distancias y ETA', () => {
  const route = [pt('A', -38.1, -57.55), pt('B', -38.1, -57.4)]

  it('tramos y distancia total', () => {
    const legs = routeLegs(MDP, route)
    expect(legs).toHaveLength(2)
    expect(legs[0]!.bearingDeg).toBeCloseTo(180, 3)
    expect(legs[0]!.distanceNm).toBeCloseTo(6.0, 1)
    expect(routeDistanceNm(MDP, route)).toBeCloseTo(legs[0]!.distanceNm + legs[1]!.distanceNm, 9)
    expect(routeDistanceNm(MDP, [])).toBe(0)
  })

  it('ETA = distancia / velocidad; sin velocidad no hay ETA', () => {
    expect(etaMs(10, 5, 0)).toBe(2 * 3_600_000)
    expect(etaMs(10, 0, 0)).toBeNull()
    expect(etaMs(10, null, 0)).toBeNull()
  })
})

describe('avance automático y avisos de arribo', () => {
  const fix = (lat: number, lon: number, speedKn: number | null = 6, courseDeg: number | null = 180): NavFix => ({
    lat,
    lon,
    speedKn,
    courseDeg,
  })
  const target = pt('Boya', -38.1, -57.55)

  it('llegada directa dentro de 0,1 Nm', () => {
    expect(hasReached(fix(-38.0995, -57.55), target)).toBe(true)
    expect(hasReached(fix(-38.09, -57.55), target)).toBe(false)
  })

  it('línea de través: pasado si quedó por detrás (> 110°) dentro de 0,27 Nm y con más de 1 kn', () => {
    // A 0,2 Nm al norte del punto, con rumbo norte (alejándose): marcación 180°, diferencia 180°.
    const north = destinationPoint(target, 0, 0.2)
    expect(hasReached(fix(north.lat, north.lon, 6, 0), target)).toBe(true)
    // Mismo lugar pero yendo hacia el punto (rumbo sur): no está pasado.
    expect(hasReached(fix(north.lat, north.lon, 6, 180), target)).toBe(false)
    // Detenido: no se confía en el rumbo.
    expect(hasReached(fix(north.lat, north.lon, 0.5, 0), target)).toBe(false)
    // Rumbo desconocido.
    expect(hasReached(fix(north.lat, north.lon, 6, null), target)).toBe(false)
  })

  it('avanza al siguiente punto, pero nunca quita el último', () => {
    const r = [target, pt('Puerto', -38.04, -57.53)]
    const s = stepRoute(r, fix(-38.0999, -57.55), DEFAULT_ARRIVAL_SETTINGS, null)
    expect(s.advanced).toBe(true)
    expect(s.route.map((p) => p.name)).toEqual(['Puerto'])
    const last = stepRoute([target], fix(-38.1, -57.55), DEFAULT_ARRIVAL_SETTINGS, null)
    expect(last.advanced).toBe(false)
    expect(last.route).toHaveLength(1)
  })

  it('avisa una sola vez por punto al entrar en la distancia de aviso', () => {
    const near = fix(-38.095, -57.55) // ~0,3 Nm
    const first = stepRoute([target], near, DEFAULT_ARRIVAL_SETTINGS, null)
    expect(first.notify?.name).toBe('Boya')
    const again = stepRoute([target], near, DEFAULT_ARRIVAL_SETTINGS, first.lastNotifiedKey)
    expect(again.notify).toBeNull()
    const far = stepRoute([target], fix(-38.0, -57.55), DEFAULT_ARRIVAL_SETTINGS, null)
    expect(far.notify).toBeNull()
  })

  it('respeta "solo destino final" y el aviso desactivado', () => {
    const r = [target, pt('Puerto', -38.04, -57.53)]
    const near = fix(-38.095, -57.55)
    expect(stepRoute(r, near, { ...DEFAULT_ARRIVAL_SETTINGS, notifyAllPoints: false }, null).notify).toBeNull()
    expect(stepRoute([target], near, { ...DEFAULT_ARRIVAL_SETTINGS, notifyAllPoints: false }, null).notify).not.toBeNull()
    expect(stepRoute([target], near, { ...DEFAULT_ARRIVAL_SETTINGS, notifyArrival: false }, null).notify).toBeNull()
  })
})

describe('velocidad y rumbo estimados', () => {
  const sample = (i: number, over: Partial<PositionSample> = {}): PositionSample => {
    // Navegando al sur a ~6 kn (3,087 m/s): 1 s entre muestras.
    const p = destinationPoint(MDP, 180, (i * 3.0867) / 1852)
    return { ...p, t: i * 1000, accuracyM: 5, speedMs: 3.0867, headingDeg: 180, ...over }
  }

  it('promedia las últimas 10 velocidades informadas, en nudos', () => {
    const s = Array.from({ length: 15 }, (_, i) => sample(i, { speedMs: i < 5 ? 0 : 3.0867 }))
    expect(averageSpeedKn(s)).toBeCloseTo(6, 1)
    expect(averageSpeedKn([])).toBeNull()
  })

  it('deriva velocidad y rumbo cuando el dispositivo no los informa', () => {
    const s = Array.from({ length: 12 }, (_, i) => sample(i, { speedMs: null, headingDeg: null }))
    expect(averageSpeedKn(s)).toBeCloseTo(6, 1)
    expect(courseOverGround(s, 6)).toBeCloseTo(180, 0)
  })

  it('no inventa rumbo detenido (movimientos dentro de la precisión)', () => {
    const s = Array.from({ length: 10 }, (_, i) => ({ ...MDP, lat: MDP.lat + (i % 2) * 0.00002, t: i * 1000, accuracyM: 8, speedMs: null, headingDeg: null }))
    expect(averageSpeedKn(s)).toBe(0)
    expect(courseOverGround(s, 0)).toBeNull()
  })

  it('usa el rumbo informado solo con velocidad suficiente', () => {
    const s = [sample(0), sample(1, { headingDeg: 42 })]
    expect(courseOverGround(s, 6)).toBe(42)
    expect(courseOverGround([sample(0, { headingDeg: 42 })], 0.1)).toBeNull()
  })

  it('pushSample descarta muestras viejas', () => {
    let s: PositionSample[] = []
    for (let i = 0; i < 200; i++) s = pushSample(s, sample(i))
    expect(s.length).toBeLessThanOrEqual(60)
    expect(s[s.length - 1]!.t).toBe(199_000)
  })
})
