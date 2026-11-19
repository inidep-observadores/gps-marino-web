import { describe, expect, it } from 'vitest'
import {
  GRID_TARGET_POINTS,
  MS_TO_KN,
  HOUR_MS,
  buildWindGridUrl,
  cardinal16,
  fieldAt,
  gridPoints,
  gridSpecFor,
  needsNewGrid,
  parseWindGrid,
  sampleField,
  windBand,
  windFromUV,
  windBarbParts,
  windBarbSide,
  windVector,
} from '../src'

const view = { west: -58, south: -39, east: -56, north: -37.5 }

describe('grilla de viento', () => {
  it('cubre lo visible con margen y ~48 puntos', () => {
    const s = gridSpecFor(view)
    expect(s.west).toBeLessThan(view.west)
    expect(s.east).toBeGreaterThan(view.east)
    expect(Math.abs(s.cols * s.rows - GRID_TARGET_POINTS)).toBeLessThanOrEqual(12)
    const pts = gridPoints(s)
    expect(pts).toHaveLength(s.cols * s.rows)
    expect(pts[0]).toEqual({ lat: s.south, lon: s.west }) // fila 0 = sur, columna 0 = oeste
    expect(pts[s.cols - 1]!.lon).toBeCloseTo(s.east, 9)
  })

  it('pide otra grilla solo si lo visible sale de ella o se acercó mucho', () => {
    const s = gridSpecFor(view)
    expect(needsNewGrid(null, view)).toBe(true)
    expect(needsNewGrid(s, view)).toBe(false)
    expect(needsNewGrid(s, { ...view, west: view.west - 5 })).toBe(true)
    const zoomed = { west: -57.2, east: -56.9, south: -38.4, north: -38.2 }
    expect(needsNewGrid(s, zoomed)).toBe(true)
  })

  it('la latitud no pasa de ±85', () => {
    const s = gridSpecFor({ west: 0, east: 10, south: 80, north: 89 })
    expect(s.north).toBe(85)
  })
})

describe('vectores y muestreo', () => {
  it('el viento "del norte" sopla hacia el sur; "del oeste", hacia el este', () => {
    const n = windVector(10, 0)
    expect(n.u).toBeCloseTo(0, 9)
    expect(n.v).toBeCloseTo(-10, 9)
    const w = windVector(10, 270)
    expect(w.u).toBeCloseTo(10, 9)
    expect(w.v).toBeCloseTo(0, 9)
  })

  it('ida y vuelta velocidad/dirección', () => {
    for (const dir of [0, 45, 135, 225, 315]) {
      const { u, v } = windVector(7, dir)
      const r = windFromUV(u, v)
      expect(r.speed).toBeCloseTo(7, 9)
      expect(r.directionFrom).toBeCloseTo(dir, 6)
    }
  })

  it('interpola en bilineal y devuelve null fuera de la grilla', () => {
    const spec = { west: 0, east: 2, south: 0, north: 2, cols: 3, rows: 3 }
    const u = Float32Array.from({ length: 9 }, (_, i) => i % 3) // crece hacia el este
    const f = { spec, u, v: new Float32Array(9) }
    expect(sampleField(f, 1.5, 1)!.u).toBeCloseTo(1.5, 6)
    expect(sampleField(f, 2.1, 1)).toBeNull()
    expect(sampleField(f, 1, -0.1)).toBeNull()
  })
})

describe('Open-Meteo', () => {
  const spec = { west: -58, east: -56, south: -39, north: -38, cols: 3, rows: 3 }
  const point = (speed: number, dir: number, hours = 4) => ({
    hourly: {
      time: Array.from({ length: hours }, (_, h) => `2026-11-19T${String(h).padStart(2, '0')}:00`),
      wind_speed_10m: Array.from({ length: hours }, (_, h) => speed + h),
      wind_direction_10m: Array.from({ length: hours }, () => dir),
    },
  })

  it('arma un solo pedido con todos los puntos, en UTC y m/s', () => {
    const url = new URL(buildWindGridUrl(spec, 3))
    expect(url.searchParams.get('latitude')!.split(',')).toHaveLength(9)
    expect(url.searchParams.get('longitude')!.split(',')).toHaveLength(9)
    expect(url.searchParams.get('timezone')).toBe('GMT')
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms')
    expect(url.searchParams.get('forecast_days')).toBe('4')
  })

  it('parsea y devuelve el campo de una hora; null si no está', () => {
    const raw = Array.from({ length: 9 }, (_, i) => point(i, 270))
    const grid = parseWindGrid(raw, spec, 123)
    expect(grid.hours).toBe(4)
    expect(grid.fetchedAt).toBe(123)
    const f = fieldAt(grid, grid.startUtcMs + 2 * HOUR_MS)!
    expect(f.u[0]).toBeCloseTo(2, 6) // viento del oeste de 0+2 m/s → u positivo
    expect(fieldAt(grid, grid.startUtcMs + 4 * HOUR_MS)).toBeNull()
    expect(fieldAt(grid, grid.startUtcMs - HOUR_MS)).toBeNull()
  })

  it('rechaza una respuesta incompleta y trata los nulos como calma', () => {
    expect(() => parseWindGrid([point(1, 0)], spec)).toThrow()
    const raw = Array.from({ length: 9 }, () => ({ hourly: { time: ['2026-11-19T00:00'], wind_speed_10m: [null], wind_direction_10m: [null] } }))
    expect(parseWindGrid(raw, spec).speed[0]![0]).toBe(0)
  })
})

describe('intensidad y rosa de los vientos', () => {
  it('bandas en nudos', () => {
    expect(windBand(3)).toBe('calm') // 5,8 kn
    expect(windBand(7)).toBe('fresh') // 13,6 kn
    expect(windBand(13)).toBe('strong') // 25 kn
    expect(windBand(20)).toBe('gale') // 39 kn
  })

  it('16 rumbos con O de oeste', () => {
    expect(cardinal16(0)).toBe('N')
    expect(cardinal16(241)).toBe('OSO')
    expect(cardinal16(270)).toBe('O')
    expect(cardinal16(270, 'W')).toBe('W')
    expect(cardinal16(359)).toBe('N')
  })
})

describe('escala Beaufort', () => {
  it('fuerza por velocidad en nudos (límites de la OMM)', async () => {
    const { beaufortForce } = await import('../src')
    const ms = (kn: number) => kn / MS_TO_KN
    expect(beaufortForce(0)).toBe(0)
    expect(beaufortForce(ms(0.9))).toBe(0)
    expect(beaufortForce(ms(1))).toBe(1)
    expect(beaufortForce(ms(6.9))).toBe(2)
    expect(beaufortForce(ms(7))).toBe(3)
    expect(beaufortForce(ms(16))).toBe(4)
    expect(beaufortForce(ms(21.9))).toBe(5)
    expect(beaufortForce(ms(33.9))).toBe(7)
    expect(beaufortForce(ms(34))).toBe(8)
    expect(beaufortForce(ms(63.9))).toBe(11)
    expect(beaufortForce(ms(64))).toBe(12)
    expect(beaufortForce(ms(150))).toBe(12)
  })
})

describe('flechas de viento (barbas)', () => {
  it('descompone la velocidad en banderines, plumas largas y cortas', () => {
    expect(windBarbParts(0)).toEqual({ calm: true, pennants: 0, full: 0, half: false })
    expect(windBarbParts(2.4).calm).toBe(true)
    expect(windBarbParts(2.5)).toEqual({ calm: false, pennants: 0, full: 0, half: true }) // 5 nudos
    expect(windBarbParts(10)).toEqual({ calm: false, pennants: 0, full: 1, half: false })
    expect(windBarbParts(17)).toEqual({ calm: false, pennants: 0, full: 1, half: true }) // redondea a 15
    expect(windBarbParts(23)).toEqual({ calm: false, pennants: 0, full: 2, half: true }) // redondea a 25
    expect(windBarbParts(50)).toEqual({ calm: false, pennants: 1, full: 0, half: false })
    expect(windBarbParts(67)).toEqual({ calm: false, pennants: 1, full: 1, half: true }) // redondea a 65
    expect(windBarbParts(112)).toEqual({ calm: false, pennants: 2, full: 1, half: false }) // redondea a 110
  })
  it('ignora velocidades negativas', () => {
    expect(windBarbParts(-3).calm).toBe(true)
  })
})

describe('lado de las plumas por hemisferio', () => {
  it('norte a la derecha, sur a la izquierda', () => {
    expect(windBarbSide(38)).toBe('right')
    expect(windBarbSide(0)).toBe('right')
    expect(windBarbSide(-0.01)).toBe('left')
    expect(windBarbSide(-45)).toBe('left')
  })
})
