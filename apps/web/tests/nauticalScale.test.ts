import { describe, expect, it } from 'vitest'
import { niceScaleNm, SCALE_STEPS_NM } from '../src/components/map/nauticalScale'

describe('escala náutica', () => {
  it('elige el mayor largo redondo que entra', () => {
    expect(niceScaleNm(0.9)).toBe(0.5)
    expect(niceScaleNm(1)).toBe(1)
    expect(niceScaleNm(7.3)).toBe(5)
    expect(niceScaleNm(63)).toBe(50)
    expect(niceScaleNm(180)).toBe(100)
    expect(niceScaleNm(1e6)).toBe(5000)
  })

  it('con el mapa muy cerca usa el menor largo en vez de fallar', () => {
    expect(niceScaleNm(0.004)).toBe(SCALE_STEPS_NM[0])
  })

  it('los largos van de menor a mayor', () => {
    for (let i = 1; i < SCALE_STEPS_NM.length; i++) expect(SCALE_STEPS_NM[i]!).toBeGreaterThan(SCALE_STEPS_NM[i - 1]!)
  })
})
