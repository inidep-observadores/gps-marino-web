import { describe, expect, it } from 'vitest'
import { buildGraticule, formatGraticuleLabel, graticuleStep, graticuleValues } from '../src'

const phone = { widthPx: 390, heightPx: 700 }
const desktop = { widthPx: 1600, heightPx: 940 }
/** Un ancho de `deg` grados centrado en el Mar Argentino. */
const view = (deg: number, ratio = 0.6) => ({ west: -58 - deg / 2, east: -58 + deg / 2, south: -40 - (deg * ratio) / 2, north: -40 + (deg * ratio) / 2 })

describe('paso de la cuadrícula', () => {
  it('modo adaptativo: más detalle al acercar, menos al alejar', () => {
    const steps = [60, 30, 14, 6, 2, 0.5, 0.1, 0.02].map((d) => graticuleStep(view(d), desktop, 'adaptive'))
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeLessThanOrEqual(steps[i - 1]!)
    expect(steps[0]).toBeGreaterThan(steps[steps.length - 1]!)
  })

  it('las líneas quedan a ~90 px: en la captura de ejemplo (14° en 1600 px) la grilla es de 1°', () => {
    expect(graticuleStep(view(14), desktop, 'adaptive')).toBe(1)
  })

  it('en el teléfono, con el mismo zoom, el paso es mayor (pantalla angosta)', () => {
    expect(graticuleStep(view(14), phone, 'adaptive')).toBeGreaterThan(graticuleStep(view(14), desktop, 'adaptive'))
  })

  it('modos fijos: 1° y ½° cuando entran', () => {
    expect(graticuleStep(view(14), desktop, 'deg1')).toBe(1)
    expect(graticuleStep(view(14), desktop, 'deg05')).toBe(0.5)
  })

  it('modos fijos: si el mapa está muy alejado se usa un paso mayor (nunca cientos de líneas)', () => {
    const far = view(120)
    for (const mode of ['deg1', 'deg05'] as const) {
      const g = buildGraticule(far, desktop, mode, { lonLabelLat: -30, latLabelLon: -100 })
      expect(g.step).toBeGreaterThan(1)
      expect(g.lines.features.length).toBeLessThanOrEqual(60)
    }
  })

  it('con mucho zoom nunca baja de 1 minuto', () => {
    expect(graticuleStep(view(0.001), desktop, 'adaptive')).toBeCloseTo(1 / 60, 6)
  })
})

describe('valores y líneas', () => {
  it('múltiplos del paso dentro del rango, sin errores de coma flotante', () => {
    expect(graticuleValues(-58.4, -55.6, 1)).toEqual([-58, -57, -56])
    expect(graticuleValues(37.9, 38.6, 1 / 6).map((v) => Math.round(v * 1e6) / 1e6)).toEqual([38, 38.166667, 38.333333, 38.5])
    expect(graticuleValues(10, 10, 1)).toEqual([10])
    expect(graticuleValues(10.1, 10.9, 1)).toEqual([])
  })

  it('arma meridianos, paralelos y una etiqueta por línea', () => {
    const g = buildGraticule({ west: -58.5, east: -55.5, south: -40.5, north: -38.5 }, desktop, 'deg1', { lonLabelLat: -38.6, latLabelLon: -58.4 })
    expect(g.step).toBe(1)
    const lon = g.lines.features.filter((f) => f.properties.axis === 'lon')
    const lat = g.lines.features.filter((f) => f.properties.axis === 'lat')
    expect(lon.map((f) => f.geometry.coordinates[0]![0])).toEqual([-58, -57, -56])
    expect(lat.map((f) => f.geometry.coordinates[0]![1])).toEqual([-40, -39])
    expect(g.labels.features.map((f) => f.properties.text)).toEqual(['40°S', '39°S', '58°O', '57°O', '56°O'])
    // los meridianos se extienden un poco más allá del borde visible
    expect(lon[0]!.geometry.coordinates[0]![1]).toBeLessThan(-40.5)
  })

  it('no pasa de ±85° de latitud (Mercator)', () => {
    const g = buildGraticule({ west: -10, east: 10, south: 60, north: 89 }, desktop, 'adaptive', { lonLabelLat: 80, latLabelLon: -9 })
    for (const f of g.lines.features) for (const [, lat] of f.geometry.coordinates) expect(Math.abs(lat)).toBeLessThanOrEqual(85)
  })
})

describe('etiquetas', () => {
  it('grados enteros con pasos de 1° o más', () => {
    expect(formatGraticuleLabel(-38, 'lat', 1)).toBe('38°S')
    expect(formatGraticuleLabel(5, 'lat', 5)).toBe('5°N')
    expect(formatGraticuleLabel(-62, 'lon', 1)).toBe('62°O')
    expect(formatGraticuleLabel(-62, 'lon', 1, 'W')).toBe('62°W')
    expect(formatGraticuleLabel(10, 'lon', 1)).toBe('10°E')
  })

  it('grados y minutos con pasos menores', () => {
    expect(formatGraticuleLabel(-38.5, 'lat', 0.5)).toBe('38°30′S')
    expect(formatGraticuleLabel(-38.0833333, 'lat', 1 / 12)).toBe('38°05′S')
    expect(formatGraticuleLabel(-57, 'lon', 0.5)).toBe('57°O')
  })

  it('una longitud fuera de ±180 se normaliza', () => {
    expect(formatGraticuleLabel(190, 'lon', 5)).toBe('170°O')
  })
})
