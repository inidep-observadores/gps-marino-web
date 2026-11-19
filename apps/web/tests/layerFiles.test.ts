import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { LayerImportError, readLayerFile } from '@/stores/layers'

describe('lectura de archivos de capa', () => {
  it('GeoJSON y GPX sueltos: nombre sin extensión y formato', async () => {
    expect(await readLayerFile(new File(['{}'], 'Áreas 2026.geojson'))).toMatchObject({ name: 'Áreas 2026', format: 'geojson', text: '{}' })
    expect((await readLayerFile(new File(['<gpx/>'], 'lances.GPX'))).format).toBe('gpx')
  })

  it('ZIP: toma el primer GPX/GeoJSON e ignora lo demás', async () => {
    const zip = zipSync({ 'leeme.txt': strToU8('x'), '__MACOSX/._a.gpx': strToU8('basura'), 'capas/b.gpx': strToU8('<gpx/>') })
    const r = await readLayerFile(new File([zip as BlobPart], 'paquete.zip'))
    expect(r).toMatchObject({ name: 'b', format: 'gpx', text: '<gpx/>' })
  })

  it('errores claros', async () => {
    await expect(readLayerFile(new File(['x'], 'capa.kml'))).rejects.toMatchObject({ code: 'unsupported' })
    const empty = zipSync({ 'leeme.txt': strToU8('x') })
    await expect(readLayerFile(new File([empty as BlobPart], 'v.zip'))).rejects.toBeInstanceOf(LayerImportError)
  })
})
