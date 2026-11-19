import { describe, expect, it } from 'vitest'
import { countTiles, expandBounds, listTiles, lonLatToTile, tileRange } from '../src'

describe('teselas XYZ', () => {
  it('puntos conocidos', () => {
    expect(lonLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 })
    expect(lonLatToTile(-180, 85, 2)).toEqual({ x: 0, y: 0 })
    // Mar del Plata a z10
    expect(lonLatToTile(-57.55, -38.0, 10)).toEqual({ x: 348, y: 629 })
  })

  it('cuenta lo mismo que enumera', () => {
    const b = { west: -58, south: -39, east: -57, north: -38 }
    expect(countTiles(b, 3, 9)).toBe([...listTiles(b, 3, 9)].length)
    expect(countTiles(b, 5, 5)).toBe(1)
  })

  it('el detalle crece ~4x por nivel y la lista va de lo general a lo fino', () => {
    const b = { west: -60, south: -40, east: -55, north: -36 }
    const a = countTiles(b, 8, 8)
    expect(countTiles(b, 9, 9)).toBeGreaterThanOrEqual(a * 3)
    const zs = [...listTiles(b, 4, 6)].map((t) => t.z)
    expect(zs).toEqual([...zs].sort((x, y) => x - y))
  })

  it('el rango queda dentro del mundo y agranda con margen', () => {
    const r = tileRange({ west: -190, south: -90, east: 190, north: 90 }, 3)
    expect([r.x0, r.x1, r.y0, r.y1]).toEqual([0, 7, 0, 7])
    const e = expandBounds({ west: -58, south: -39, east: -57, north: -38 }, 0.1)
    expect(e).toEqual({ west: -58.1, south: -39.1, east: -56.9, north: -37.9 })
  })
})
