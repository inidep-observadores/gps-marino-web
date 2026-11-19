import { describe, expect, it } from 'vitest'
import type { WaypointInput } from '@gpsm/shared'
import { isDirty, parseDecimal, parseWaypointForm, toFormValues } from '@/logic/waypointForm'

const base: WaypointInput = {
  description: 'Lance 12',
  recordedAt: new Date(2026, 10, 18, 14, 5, 9, 321).getTime(),
  lat: -(38 + 0.33 / 60),
  lon: -(57 + 32.556 / 60),
  speedKn: 3.25,
  bearing: 145,
  icon: 'fishFins',
  color: 'blue',
  visible: true,
}

describe('formulario de ubicación', () => {
  it('convierte a grados-minutos-hemisferio, fecha y hora locales', () => {
    const v = toFormValues(base)
    expect(v).toMatchObject({ latDeg: '38', latMin: '0.33', latSouth: true, lonDeg: '57', lonMin: '32.556', lonWest: true })
    expect(v).toMatchObject({ date: '2026-11-18', time: '14:05:09', speed: '3.25', bearing: '145' })
  })

  it('ida y vuelta sin cambios conserva el instante exacto (ms) y la posición', () => {
    const { input, errors } = parseWaypointForm(toFormValues(base), base.recordedAt)
    expect(errors).toEqual({})
    expect(input!.recordedAt).toBe(base.recordedAt)
    expect(input!.lat).toBeCloseTo(base.lat, 7)
    expect(input!.lon).toBeCloseTo(base.lon, 7)
  })

  it('acepta coma decimal y cambia de hemisferio', () => {
    const v = { ...toFormValues(base), latMin: '15,5', latSouth: false, lonWest: false }
    const { input } = parseWaypointForm(v)
    expect(input!.lat).toBeCloseTo(38 + 15.5 / 60, 9)
    expect(input!.lon).toBeGreaterThan(0)
  })

  it('valida rangos como la app Flutter', () => {
    const v = toFormValues(base)
    expect(parseWaypointForm({ ...v, latDeg: '' }).errors.latDeg).toBe('required')
    expect(parseWaypointForm({ ...v, latDeg: '91' }).errors.latDeg).toBe('deg90')
    expect(parseWaypointForm({ ...v, latDeg: '12.5' }).errors.latDeg).toBe('deg90')
    expect(parseWaypointForm({ ...v, lonDeg: '181' }).errors.lonDeg).toBe('deg180')
    expect(parseWaypointForm({ ...v, latMin: '60' }).errors.latMin).toBe('min60')
    expect(parseWaypointForm({ ...v, latDeg: '90', latMin: '1' }).errors.latMin).toBe('min60')
    expect(parseWaypointForm({ ...v, speed: '-1' }).errors.speed).toBe('speed')
    expect(parseWaypointForm({ ...v, speed: 'rápido' }).errors.speed).toBe('speed')
    expect(parseWaypointForm({ ...v, bearing: '361' }).errors.bearing).toBe('bearing')
    expect(parseWaypointForm({ ...v, bearing: '' }).errors.bearing).toBe('required')
    expect(parseWaypointForm({ ...v, date: '' }).errors.date).toBe('required')
    expect(parseWaypointForm({ ...v, date: '2026-02-31' }).errors.date).toBe('date')
    expect(parseWaypointForm({ ...v, latDeg: '91' }).input).toBeNull()
  })

  it('hora sin segundos también es válida', () => {
    const { input } = parseWaypointForm({ ...toFormValues(base), time: '09:30' })
    expect(new Date(input!.recordedAt).getSeconds()).toBe(0)
    expect(new Date(input!.recordedAt).getHours()).toBe(9)
  })

  it('detecta cambios', () => {
    const v = toFormValues(base)
    expect(isDirty(v, { ...v })).toBe(false)
    expect(isDirty(v, { ...v, description: 'x' })).toBe(true)
  })

  it('parseDecimal', () => {
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal(' 12 ')).toBe(12)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('1.2.3')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
})
