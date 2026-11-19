import { describe, expect, it } from 'vitest'
import { SCENE_H, SCENE_W, seaScene, waveAmplitude } from '../src/logic/seaWaves'

describe('dibujo del mar por fuerza Beaufort', () => {
  it('es determinista: la misma fuerza da siempre el mismo dibujo', () => {
    for (const f of [0, 4, 8, 12]) expect(seaScene(f)).toEqual(seaScene(f))
  })

  it('la altura de las olas crece con la fuerza', () => {
    for (let f = 1; f <= 12; f++) expect(waveAmplitude(f)).toBeGreaterThan(waveAmplitude(f - 1))
    expect(waveAmplitude(0)).toBeLessThan(1)
  })

  it('las capas son caminos cerrados que cubren todo el ancho', () => {
    const s = seaScene(6)
    for (const p of s.layers) {
      expect(p.startsWith(`M0,${SCENE_H} L0,`)).toBe(true)
      expect(p.endsWith(`L${SCENE_W},${SCENE_H} Z`)).toBe(true)
    }
  })

  it('espuma sobre las crestas desde la fuerza 3 y más cuanto más viento', () => {
    expect(seaScene(0).caps).toHaveLength(0)
    expect(seaScene(2).caps).toHaveLength(0)
    expect(seaScene(3).caps.length).toBeGreaterThan(0)
    expect(seaScene(8).caps.length).toBeGreaterThanOrEqual(seaScene(3).caps.length)
    for (const c of seaScene(8).caps) {
      expect(c.x).toBeGreaterThan(0)
      expect(c.x).toBeLessThan(SCENE_W)
    }
  })

  it('rayas de viento: ninguna en calma y más con la fuerza; rociones solo desde la 9', () => {
    expect(seaScene(0).streaks).toHaveLength(0)
    expect(seaScene(10).streaks.length).toBeGreaterThan(seaScene(2).streaks.length)
    expect(seaScene(8).spray).toHaveLength(0)
    expect(seaScene(10).spray.length).toBeGreaterThan(0)
  })

  it('una fuerza fuera de rango se acota a 0–12', () => {
    expect(seaScene(-3)).toEqual(seaScene(0))
    expect(seaScene(99)).toEqual(seaScene(12))
  })
})
