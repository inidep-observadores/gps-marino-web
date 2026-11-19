import { describe, expect, it } from 'vitest'
import { clampUpdatedAt, incomingWins, pullQuerySchema, pushRequestSchema } from '../src'

describe('protocolo de sync', () => {
  it('un push vacío es válido y completa los valores por defecto', () => {
    const p = pushRequestSchema.parse({})
    expect(p.waypoints).toEqual([])
    expect(p.route).toBeNull()
  })

  it('rechaza un waypoint con coordenadas fuera de rango', () => {
    const w = {
      id: '0190a4b8-7c1d-7000-8000-000000000001', createdAt: 1, updatedAt: 1, deletedAt: null, description: '', recordedAt: 1,
      lat: 91, lon: 0, speedKn: 0, bearing: 0, icon: 'fishFins', color: 'red', visible: true,
    }
    expect(pushRequestSchema.safeParse({ waypoints: [w] }).success).toBe(false)
  })

  it('última escritura gana; el empate lo gana el entrante', () => {
    expect(incomingWins(10, null)).toBe(true)
    expect(incomingWins(10, 9)).toBe(true)
    expect(incomingWins(10, 10)).toBe(true)
    expect(incomingWins(9, 10)).toBe(false)
  })

  it('recorta un reloj adelantado más de 5 minutos', () => {
    expect(clampUpdatedAt(1_000, 5_000)).toBe(1_000)
    expect(clampUpdatedAt(10_000_000, 5_000)).toBe(5_000 + 300_000)
  })

  it('el pull tiene valores por defecto y topes', () => {
    expect(pullQuerySchema.parse({})).toEqual({ since: 0, limit: 200 })
    expect(pullQuerySchema.safeParse({ limit: '100000' }).success).toBe(false)
  })
})
