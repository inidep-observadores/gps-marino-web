import { describe, expect, it } from 'vitest'
import { HOUR_MS } from '@gpsm/shared'
import { clampHour, currentHourMs, daysInRange, localDayKey, sameLocalTimeOnDay, selectableRange } from '@/logic/windTime'

const start = Date.UTC(2026, 10, 19, 0)
const grid = { startUtcMs: start, hours: 96 }

describe('horas elegibles del pronóstico de viento', () => {
  it('empieza en la hora actual y termina en la última del pronóstico', () => {
    const now = start + 5 * HOUR_MS + 20 * 60_000
    expect(currentHourMs(now)).toBe(start + 5 * HOUR_MS)
    expect(selectableRange(grid, now)).toEqual({ min: start + 5 * HOUR_MS, max: start + 95 * HOUR_MS })
  })

  it('si el pronóstico es de antes de ahora, arranca en su primera hora; si ya terminó, no hay rango', () => {
    expect(selectableRange(grid, start - 3 * HOUR_MS)!.min).toBe(start)
    expect(selectableRange(grid, start + 200 * HOUR_MS)).toBeNull()
  })

  it('ajusta una hora al rango y a la hora en punto', () => {
    const r = { min: start + 5 * HOUR_MS, max: start + 20 * HOUR_MS }
    expect(clampHour(start, r)).toBe(r.min)
    expect(clampHour(start + 99 * HOUR_MS, r)).toBe(r.max)
    expect(clampHour(start + 10 * HOUR_MS + 31 * 60_000, r)).toBe(start + 11 * HOUR_MS)
  })

  it('agrupa por día local y conserva el horario al saltar de día', () => {
    const r = { min: start, max: start + 95 * HOUR_MS }
    const days = daysInRange(r)
    expect(days.length).toBeGreaterThanOrEqual(4)
    expect(days.length).toBeLessThanOrEqual(5)
    expect(days[0]!.firstMs).toBe(start)
    expect(new Set(days.map((d) => d.key)).size).toBe(days.length)
    const from = new Date(2026, 10, 19, 15).getTime()
    const to = sameLocalTimeOnDay(from, days[2]!, r)
    expect(new Date(to).getHours()).toBe(15)
    expect(localDayKey(to)).toBe(days[2]!.key)
  })
})
