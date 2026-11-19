import { describe, expect, it } from 'vitest'
import { ARGENMAP_MAX_ZOOM, MAP_TYPES, argenmapTemplate, argenmapTileUrl, rasterBaseStyle } from '../src/components/map/mapStyles'

describe('Argenmap (mapa base del IGN)', () => {
  it('es el tipo estándar y el vectorial de OpenFreeMap sigue disponible', () => {
    expect(MAP_TYPES[0]).toBe('standard')
    expect(MAP_TYPES).toContain('vector')
  })

  it('el estilo usa TMS (eje Y invertido) con la capa clara u oscura según el tema', () => {
    const light = rasterBaseStyle('standard', '#fff', false)
    const dark = rasterBaseStyle('standard', '#000', true)
    const src = light.sources.argenmap as { type: string; scheme: string; tiles: string[]; maxzoom: number; attribution: string }
    expect(src.type).toBe('raster')
    expect(src.scheme).toBe('tms')
    expect(src.maxzoom).toBe(ARGENMAP_MAX_ZOOM)
    expect(src.tiles[0]).toBe('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png')
    expect(src.attribution).toContain('Instituto Geográfico Nacional')
    expect((dark.sources.argenmap as { tiles: string[] }).tiles[0]).toContain('argenmap_oscuro')
    expect(light.layers.map((l) => l.id)).toEqual(['background', 'argenmap'])
  })

  it('la URL de una tesela invierte Y (XYZ → TMS)', () => {
    // z=6, y XYZ 42 → y TMS 2^6 - 1 - 42 = 21 (Islas Malvinas)
    expect(argenmapTileUrl(6, 21, 42, false)).toBe('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/6/21/21.png')
    expect(argenmapTileUrl(0, 0, 0, true)).toContain('argenmap_oscuro@EPSG%3A3857@png/0/0/0.png')
    expect(argenmapTemplate(false)).toContain('{z}/{x}/{y}.png')
  })

  it('los demás mapas raster siguen igual (Esri, sin TMS)', () => {
    const sat = rasterBaseStyle('satellite', '#000')
    expect((sat.sources.imagery as { scheme?: string }).scheme).toBeUndefined()
    expect((sat.sources.imagery as { tiles: string[] }).tiles[0]).toContain('arcgisonline.com')
  })
})
