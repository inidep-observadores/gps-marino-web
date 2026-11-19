import { describe, expect, it } from 'vitest'
import {
  bearingDeg,
  circleRing,
  cogLine,
  distanceNm,
  distanceRings,
  polylineNm,
  routeLine,
  routePoints,
  uuidv7,
  waypointFeatures,
  type Waypoint,
} from '../src'

const C = { lat: -38, lon: -57.5 }
const back = ([lon, lat]: [number, number]) => ({ lat, lon })

describe('geometrías del mapa', () => {
  it('círculo cerrado a la distancia pedida', () => {
    const ring = circleRing(C, 2, 36)
    expect(ring).toHaveLength(37)
    expect(ring[0]).toEqual(ring[36])
    for (const p of ring) expect(distanceNm(C, back(p))).toBeCloseTo(2, 6)
  })

  it('anillos de distancia: cantidad, radios y etiqueta al norte', () => {
    const { rings, labels } = distanceRings(C, 3, 0.5)
    expect(rings.features.map((f) => f.properties.radiusNm)).toEqual([0.5, 1, 1.5])
    const l = back(labels.features[2]!.geometry.coordinates)
    expect(distanceNm(C, l)).toBeCloseTo(1.5, 6)
    expect(bearingDeg(C, l)).toBeCloseTo(0, 4)
    expect(distanceRings(C, 3, 0).rings.features).toHaveLength(0)
    expect(distanceRings(C, 99, 1).rings.features).toHaveLength(20)
  })

  it('línea COG: velocidad × tiempo en el rumbo; nada si está detenido', () => {
    const line = cogLine(C, 90, 6, 10)!
    const end = back(line.coordinates[1]!)
    expect(distanceNm(C, end)).toBeCloseTo(1, 6)
    expect(bearingDeg(C, end)).toBeCloseTo(90, 3)
    expect(cogLine(C, null, 6, 10)).toBeNull()
    expect(cogLine(C, 90, 0, 10)).toBeNull()
  })

  it('línea y puntos de la ruta', () => {
    const route = [
      { name: 'A', lat: -38.1, lon: -57.5, waypointId: null },
      { name: 'B', lat: -38.2, lon: -57.4, waypointId: null },
    ]
    expect(routeLine(C, route)!.coordinates).toHaveLength(3)
    expect(routeLine(null, route.slice(0, 1))).toBeNull()
    expect(routePoints(route).features.map((f) => f.properties.role)).toEqual(['next', 'final'])
  })

  it('solo las ubicaciones visibles, con la imagen de su ícono y color', () => {
    const w = (visible: boolean): Waypoint => ({
      id: uuidv7(), createdAt: 0, updatedAt: 0, deletedAt: null, description: 'x', recordedAt: 0,
      lat: -38, lon: -57, speedKn: 0, bearing: 0, icon: 'anchor', color: 'red', visible,
    })
    const fc = waypointFeatures([w(true), w(false)])
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]!.properties.image).toBe('mark-anchor-red')
  })

  it('medición: suma de tramos', () => {
    const pts = [C, { lat: -38.1, lon: -57.5 }, { lat: -38.1, lon: -57.4 }]
    expect(polylineNm(pts)).toBeCloseTo(distanceNm(pts[0]!, pts[1]!) + distanceNm(pts[1]!, pts[2]!), 9)
    expect(polylineNm([C])).toBe(0)
  })
})
