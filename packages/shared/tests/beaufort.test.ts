import { describe, expect, it } from 'vitest'
import { BEAUFORT_SCALE, beaufortForce, beaufortFromKnots, beaufortKmh, beaufortTone } from '../src'

describe('escala de Beaufort', () => {
  it('tiene las 13 fuerzas, en orden, sin huecos entre rangos', () => {
    expect(BEAUFORT_SCALE).toHaveLength(13)
    BEAUFORT_SCALE.forEach((l, i) => expect(l.force).toBe(i))
    for (let i = 1; i < BEAUFORT_SCALE.length; i++) {
      const prev = BEAUFORT_SCALE[i - 1]!
      expect(BEAUFORT_SCALE[i]!.minKn).toBe((prev.maxKn ?? 0) + 1)
    }
    expect(BEAUFORT_SCALE[12]!.maxKn).toBeNull()
  })

  it('las alturas de ola crecen con la fuerza', () => {
    for (let i = 1; i < BEAUFORT_SCALE.length; i++) expect(BEAUFORT_SCALE[i]!.waveM).toBeGreaterThanOrEqual(BEAUFORT_SCALE[i - 1]!.waveM)
  })

  it('la fuerza de una velocidad cae dentro del rango de ese nivel', () => {
    for (const l of BEAUFORT_SCALE) {
      expect(beaufortFromKnots(l.minKn)).toBe(l.force)
      if (l.maxKn != null) expect(beaufortFromKnots(l.maxKn)).toBe(l.force)
    }
    expect(beaufortFromKnots(0.4)).toBe(0)
    expect(beaufortFromKnots(10)).toBe(3)
    expect(beaufortFromKnots(11)).toBe(4)
    expect(beaufortFromKnots(200)).toBe(12)
    expect(beaufortFromKnots(-5)).toBe(0)
    expect(beaufortFromKnots(Number.NaN)).toBe(0)
  })

  it('coincide con la fuerza que usa el mapa de viento (m/s)', () => {
    for (const kn of [0, 0.5, 1, 3.9, 4, 9, 10.5, 16.9, 17, 33, 40, 47.5, 64, 90]) {
      expect(beaufortFromKnots(kn)).toBe(beaufortForce(kn / (3600 / 1852)))
    }
  })

  it('km/h a partir de los nudos', () => {
    expect(beaufortKmh(BEAUFORT_SCALE[3]!)).toEqual({ min: 13, max: 19 })
    expect(beaufortKmh(BEAUFORT_SCALE[12]!)).toEqual({ min: 119, max: null })
  })

  it('los colores van de verde (calma y brisas) a rojo (temporales)', () => {
    expect(BEAUFORT_SCALE.map((l) => beaufortTone(l.force))).toEqual([
      'go', 'go', 'go', 'go', 'caution', 'caution', 'orange', 'orange', 'stop', 'stop', 'stop', 'stop', 'stop',
    ])
  })
})
