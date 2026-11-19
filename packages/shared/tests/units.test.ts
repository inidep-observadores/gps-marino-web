import { describe, expect, it } from 'vitest'
import {
  CABLE_M,
  FATHOM_M,
  convertAll,
  coordForms,
  coordFromDecimal,
  coordFromDm,
  coordFromDms,
  coordInRange,
  parseNumber,
  toDegMinSec,
} from '../src'

describe('conversiones lineales', () => {
  it('profundidad: braza náutica = 1,8288 m', () => {
    const r = convertAll('depth', 'm', 100)
    expect(r.fathom).toBeCloseTo(54.6807, 3)
    expect(convertAll('depth', 'fathom', 10).m).toBeCloseTo(18.288, 9)
    expect(FATHOM_M).toBe(1.8288)
  })

  it('distancia larga: 1 Mn = 1,852 km', () => {
    expect(convertAll('distanceLong', 'nm', 1).km).toBeCloseTo(1.852, 9)
    expect(convertAll('distanceLong', 'km', 10).nm).toBeCloseTo(5.39957, 4)
  })

  it('distancia corta: 1 cable = 0,1 Mn = 185,2 m', () => {
    expect(CABLE_M).toBe(185.2)
    expect(convertAll('distanceShort', 'cable', 1).m).toBeCloseTo(185.2, 9)
    expect(convertAll('distanceShort', 'm', 1852).cable).toBeCloseTo(10, 9)
    // 1 cable = 0,1 Mn
    expect(convertAll('distanceShort', 'cable', 1).m! / convertAll('distanceLong', 'nm', 1).km! / 1000).toBeCloseTo(0.1, 9)
  })

  it('velocidad: nudos, km/h y m/s', () => {
    const r = convertAll('speed', 'kn', 10)
    expect(r.kmh).toBeCloseTo(18.52, 9)
    expect(r.ms).toBeCloseTo(5.14444, 4)
    expect(convertAll('speed', 'kmh', 36).ms).toBeCloseTo(10, 9)
    expect(convertAll('speed', 'ms', 1).kn).toBeCloseTo(1.94384, 4)
  })

  it('presión: 1013,25 hPa = 760 mmHg', () => {
    expect(convertAll('pressure', 'hpa', 1013.25).mmhg).toBeCloseTo(760, 3)
    expect(convertAll('pressure', 'mmhg', 760).hpa).toBeCloseTo(1013.25, 3)
  })

  it('ida y vuelta no pierde precisión', () => {
    for (const [group, a, b] of [['depth', 'm', 'fathom'], ['speed', 'kn', 'ms'], ['pressure', 'hpa', 'mmhg'], ['distanceShort', 'm', 'cable']] as const) {
      const there = convertAll(group, a, 123.456)[b]!
      expect(convertAll(group, b, there)[a]).toBeCloseTo(123.456, 9)
    }
  })

  it('una unidad desconocida lanza', () => {
    expect(() => convertAll('depth', 'pies', 1)).toThrow()
  })

  it('el valor 0 y los negativos se convierten linealmente', () => {
    expect(convertAll('speed', 'kn', 0).kmh).toBe(0)
    expect(convertAll('depth', 'm', -5).fathom).toBeCloseTo(-2.7340, 3)
  })
})

describe('números escritos a mano', () => {
  it('acepta coma o punto, espacios y signo', () => {
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber(' 12.5 ')).toBe(12.5)
    expect(parseNumber('-0,25')).toBe(-0.25)
    expect(parseNumber('+3')).toBe(3)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('1 000,5')).toBe(1000.5)
  })

  it('rechaza lo que no es un número', () => {
    for (const bad of ['', ' ', 'abc', '1,2,3', '1.2.3', '--1', '1e5', '12a', ',']) expect(parseNumber(bad), bad).toBeNull()
  })
})

describe('coordenadas', () => {
  it('grados decimales → grados, minutos y segundos', () => {
    const d = toDegMinSec(-38.0055)
    expect(d).toEqual({ deg: 38, min: 0, sec: 19.8, negative: true })
    expect(toDegMinSec(57.5426).sec).toBeCloseTo(33.36, 2)
  })

  it('el acarreo de segundos y minutos es correcto', () => {
    expect(toDegMinSec(37 + 59 / 60 + 59.999 / 3600)).toMatchObject({ deg: 38, min: 0, sec: 0 })
    expect(toDegMinSec(10.999999)).toMatchObject({ deg: 11, min: 0, sec: 0 })
  })

  it('las tres formas son equivalentes (ida y vuelta)', () => {
    for (const v of [-38.0055, 57.5426, 0, -0.5, 179.999, -89.9999]) {
      const f = coordForms(v)
      expect(coordFromDecimal(f.decimal, f.negative)).toBeCloseTo(v, 9)
      expect(coordFromDm(f.dm.deg, f.dm.min, f.negative)).toBeCloseTo(v, 6)
      expect(coordFromDms(f.dms.deg, f.dms.min, f.dms.sec, f.negative)).toBeCloseTo(v, 4)
    }
  })

  it('formas de una coordenada conocida', () => {
    const f = coordForms(-57.5426)
    expect(f.negative).toBe(true)
    expect(f.decimal).toBeCloseTo(57.5426, 9)
    expect(f.dm.deg).toBe(57)
    expect(f.dm.min).toBeCloseTo(32.556, 6)
    expect(f.dms).toMatchObject({ deg: 57, min: 32 })
    expect(f.dms.sec).toBeCloseTo(33.36, 3)
  })

  it('los rangos: latitud ±90°, longitud ±180°', () => {
    expect(coordInRange('lat', 90)).toBe(true)
    expect(coordInRange('lat', -90.0001)).toBe(false)
    expect(coordInRange('lon', -180)).toBe(true)
    expect(coordInRange('lon', 180.5)).toBe(false)
  })
})
