import { describe, expect, it } from 'vitest'
import { waypointFromCapture } from '@/composables/usePositionLog'

describe('registro de posición', () => {
  const sample = { lat: -38.0055, lon: -57.5426, t: 1_763_000_000_000, accuracyM: 5, speedMs: 4.1, headingDeg: 135.8 }

  it('guarda la posición capturada con velocidad a 2 decimales y rumbo entero (como Flutter)', () => {
    const w = waypointFromCapture(
      { sample, speedKn: 7.96842, courseDeg: 135.8 },
      { description: 'Registro rápido', icon: 'lifeRing', color: 'orange', visible: true },
    )
    expect(w).toEqual({
      description: 'Registro rápido',
      icon: 'lifeRing',
      color: 'orange',
      visible: true,
      recordedAt: sample.t,
      lat: sample.lat,
      lon: sample.lon,
      speedKn: 7.97,
      bearing: 135,
    })
  })

  it('sin velocidad ni rumbo conocidos guarda 0', () => {
    const w = waypointFromCapture({ sample, speedKn: null, courseDeg: null }, { description: '', icon: 'locationDot', color: 'green', visible: false })
    expect(w.speedKn).toBe(0)
    expect(w.bearing).toBe(0)
  })
})
