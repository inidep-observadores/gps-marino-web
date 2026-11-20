import { describe, expect, it } from 'vitest'
import { pickTrackColor, TRACK_COLOR_COUNT, trackColorIndex } from '../src'

describe('colores de derrotas', () => {
  it('no repite color hasta agotar la paleta', () => {
    const used: number[] = []
    for (let i = 0; i < TRACK_COLOR_COUNT; i++) used.push(pickTrackColor(used))
    expect(new Set(used).size).toBe(TRACK_COLOR_COUNT)
  })
  it('después reparte parejo', () => {
    const used: number[] = []
    for (let i = 0; i < TRACK_COLOR_COUNT * 2; i++) used.push(pickTrackColor(used))
    for (let c = 0; c < TRACK_COLOR_COUNT; c++) expect(used.filter((u) => u === c)).toHaveLength(2)
  })
  it('elige entre los menos usados', () => {
    expect(pickTrackColor([0, 0, 1], () => 0)).toBe(2)
  })
  it('sin color guardado usa uno estable según el id', () => {
    const a = trackColorIndex('abc', null)
    expect(a).toBe(trackColorIndex('abc', undefined))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(TRACK_COLOR_COUNT)
    expect(trackColorIndex('abc', 4)).toBe(4)
  })
})
