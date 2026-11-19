import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { parseOfmUrl, rewriteOfmStyle, tileKey } from '@/components/map/offlineTiles'

describe('teselas de OpenFreeMap sin conexión', () => {
  it('la clave del caché no depende de la versión del planeta', () => {
    expect(tileKey(7, 43, 82)).toBe('https://gpsm.local/ofm/7/43/82.pbf')
  })

  it('lee las coordenadas del protocolo propio', () => {
    expect(parseOfmUrl('ofm://7/43/82')).toEqual({ z: 7, x: 43, y: 82 })
    expect(parseOfmUrl('https://x/7/43/82')).toBeNull()
  })

  it('reescribe solo la fuente vectorial de OpenFreeMap', () => {
    const style = {
      version: 8,
      sources: {
        openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
        other: { type: 'raster', tiles: ['https://a/{z}/{x}/{y}.png'] },
      },
      layers: [],
    } as unknown as StyleSpecification
    const out = rewriteOfmStyle(style)
    expect(out.sources.openmaptiles).toMatchObject({ type: 'vector', tiles: ['ofm://{z}/{x}/{y}'], maxzoom: 14 })
    expect(out.sources.other).toEqual(style.sources.other)
    expect(style.sources.openmaptiles).toHaveProperty('url') // no muta el original
  })
})
