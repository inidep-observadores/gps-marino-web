import { describe, expect, it } from 'vitest'
import { buildPointWaveUrl, buildPointWindUrl, hourAt, hoursFrom, niceScale, parsePointForecast } from '../src'

const times = ['2026-11-19T00:00', '2026-11-19T01:00', '2026-11-19T02:00']
const wind = { hourly: { time: times, wind_speed_10m: [5, 6, null], wind_gusts_10m: [8, 9, 10], wind_direction_10m: [270, 280, 290] } }
const waves = { hourly: { time: times, wave_height: [1.2, 1.4, 1.6], wave_period: [7, 8, 9], wave_direction: [200, 210, 220], swell_wave_height: [0.8, 0.9, 1], swell_wave_period: [10, 10, 11], swell_wave_direction: [190, 190, 190] } }

describe('pronóstico de un punto', () => {
  it('arma los dos pedidos en UTC y SI', () => {
    const w = new URL(buildPointWindUrl(-38.1234567, -57.5, 4))
    expect(w.searchParams.get('latitude')).toBe('-38.1235')
    expect(w.searchParams.get('hourly')).toContain('wind_gusts_10m')
    expect(w.searchParams.get('wind_speed_unit')).toBe('ms')
    expect(w.searchParams.get('timezone')).toBe('GMT')
    const m = new URL(buildPointWaveUrl(-38, -57, 4))
    expect(m.hostname).toBe('marine-api.open-meteo.com')
    expect(m.searchParams.get('hourly')).toContain('swell_wave_period')
  })

  it('une viento y olas por instante; los nulos quedan nulos', () => {
    const f = parsePointForecast(wind, waves, -38, -57, 99)
    expect(f.hasWaves).toBe(true)
    expect(f.fetchedAt).toBe(99)
    expect(f.hours).toHaveLength(3)
    expect(f.hours[2]).toMatchObject({ windMs: null, gustMs: 10, waveH: 1.6, swellT: 11 })
    expect(f.hours[0]!.t).toBe(Date.UTC(2026, 10, 19, 0))
  })

  it('sin cobertura marina: solo viento', () => {
    const f = parsePointForecast(wind, null, -38, -57)
    expect(f.hasWaves).toBe(false)
    expect(f.hours[0]!.waveH).toBeNull()
    const land = { hourly: { time: times, wave_height: [null, null, null] } }
    expect(parsePointForecast(wind, land, 0, 0).hasWaves).toBe(false)
  })

  it('las olas se alinean por hora aunque lleguen desfasadas', () => {
    const shifted = { hourly: { time: times.slice(1), wave_height: [9, 8] } }
    const f = parsePointForecast(wind, shifted, 0, 0)
    expect(f.hours.map((h) => h.waveH)).toEqual([null, 9, 8])
  })

  it('rechaza una respuesta vacía', () => {
    expect(() => parsePointForecast({ hourly: { time: [] } }, null, 0, 0)).toThrow()
  })

  it('filtra desde una hora y busca la más cercana', () => {
    const f = parsePointForecast(wind, waves, 0, 0)
    expect(hoursFrom(f, Date.UTC(2026, 10, 19, 1, 40))).toHaveLength(2)
    expect(hourAt(f, Date.UTC(2026, 10, 19, 1, 40))!.t).toBe(Date.UTC(2026, 10, 19, 2))
  })

  it('escala del eje', () => {
    expect(niceScale(17)).toEqual({ max: 20, step: 5 })
    expect(niceScale(3.1)).toEqual({ max: 4, step: 1 })
    expect(niceScale(0).max).toBeGreaterThan(0)
  })
})
