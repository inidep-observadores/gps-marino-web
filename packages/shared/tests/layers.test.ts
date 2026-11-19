import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import {
  BASE_GROUPS,
  DEFAULT_BASE_VISIBLE,
  LayerFormatError,
  areaLabel,
  detectLayerFormat,
  featureAnchor,
  layerNameFromFile,
  parseGeoJsonLayer,
  parseGpxLayer,
  parseHexColor,
  relatedFeatureIds,
  sanitizeGpx,
  withHidden,
} from '../src'

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const xml = (s: string) => new DOMParser().parseFromString(s, 'text/xml') as unknown as Document
const opts = { key: 'L', defaultColor: '#3366ff' }
/** Punto dentro de un anillo (ray casting). */
function inside([x, y]: [number, number], ring: [number, number][]): boolean {
  let ok = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok
  }
  return ok
}

describe('formato y utilidades', () => {
  it('detecta el formato por extensión y arma el nombre', () => {
    expect(detectLayerFormat('Lances.GPX')).toBe('gpx')
    expect(detectLayerFormat('a.geojson')).toBe('geojson')
    expect(detectLayerFormat('a.json')).toBe('geojson')
    expect(detectLayerFormat('a.kml')).toBeNull()
    expect(layerNameFromFile('dir/Lances 2026.gpx')).toBe('Lances 2026')
  })

  it('colores hexadecimales de simplestyle', () => {
    expect(parseHexColor('#F00')).toBe('#ff0000')
    expect(parseHexColor('00ff00')).toBe('#00ff00')
    expect(parseHexColor('#112233ff')).toBe('#112233')
    expect(parseHexColor('rojo')).toBeNull()
    expect(parseHexColor(3)).toBeNull()
  })

  it('quita las fechas inválidas de los GPX', () => {
    expect(sanitizeGpx('<a><time>2026-08-10T11:10:00.000Z-3</time><b/></a>')).toBe('<a><b/></a>')
  })
})

describe('GeoJSON (capas base reales de la app Flutter)', () => {
  it('centolla: multipolígono con relleno al 15 % y etiqueta del nombre del archivo', () => {
    const l = parseGeoJsonLayer(fx('area_centolla_C1.geojson'), { ...opts, group: 'areasCentolla', fileName: 'area_centolla_C1.geojson' })
    expect(l.features.every((f) => f.geometry.type === 'Polygon')).toBe(true)
    expect(l.features[0]!.properties._fillOpacity).toBe(0.15)
    expect(l.labels.map((x) => x.properties.text)).toEqual(['C1'])
    // La etiqueta cae dentro de una de las partes del área.
    const p = l.labels[0]!.geometry.coordinates
    expect(l.features.some((f) => f.geometry.type === 'Polygon' && inside(p, f.geometry.coordinates[0]!))).toBe(true)
  })

  it('vieira: etiqueta = sufijo del nombre; langostino: número del Id_area', () => {
    const v = parseGeoJsonLayer(fx('areas_vieira.geojson'), { ...opts, group: 'areasVieira' })
    expect(v.labels.length).toBeGreaterThan(0)
    expect(v.labels.every((x) => !x.properties.text.includes('_'))).toBe(true)
    const g = parseGeoJsonLayer(fx('areas_langostino.geojson'), { ...opts, group: 'areasLangostino' })
    expect(g.labels.length).toBeGreaterThan(0)
    expect(g.labels.every((x) => /^\d+$/.test(x.properties.text))).toBe(true)
  })

  it('áreas generales: sin relleno; líneas con su nombre', () => {
    const m = parseGeoJsonLayer(fx('mar_territorial.geojson'), { ...opts, group: 'areasGenerales' })
    expect(m.features.length).toBeGreaterThan(0)
    expect(m.features[0]!.properties._title).toContain('Mar Territorial')
    expect(m.labels).toEqual([])
  })

  it('veda merluza negra: línea simple con descripción', () => {
    const l = parseGeoJsonLayer(fx('veda_merluza_negra.geojson'), { ...opts, group: 'zonasVeda' })
    expect(l.features[0]!.geometry.type).toBe('LineString')
    expect(l.features[0]!.properties._desc).toBe('Polilínea conectando los 4 puntos')
  })
})

describe('GeoJSON importado (simplestyle-spec)', () => {
  const fc = (features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features })

  it('respeta stroke, stroke-width, fill y marker-color; si no, el color por defecto', () => {
    const l = parseGeoJsonLayer(
      fc([
        { type: 'Feature', properties: { stroke: '#ff0000', 'stroke-width': 4, 'stroke-opacity': 0.5 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
        { type: 'Feature', properties: { fill: '#00ff00', 'fill-opacity': 0.4 }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
        { type: 'Feature', properties: { 'marker-color': '#123456', title: 'Boya', description: 'Roja' }, geometry: { type: 'Point', coordinates: [2, 2] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [3, 3] } },
      ]),
      opts,
    )
    const [line, poly, p1, p2] = l.features.map((f) => f.properties)
    expect(line).toMatchObject({ _kind: 'line', _stroke: '#ff0000', _strokeWidth: 4, _strokeOpacity: 0.5 })
    expect(poly).toMatchObject({ _kind: 'polygon', _fill: '#00ff00', _fillOpacity: 0.4, _stroke: '#3366ff' })
    expect(p1).toMatchObject({ _color: '#123456', _title: 'Boya', _desc: 'Roja' })
    expect(p2!._color).toBe('#3366ff')
    // Las descripciones de puntos solo se ofrecen en capas importadas.
    expect(l.descriptions.map((d) => d.properties.text)).toEqual(['Roja'])
  })

  it('separa las geometrías Multi en elementos con id propio', () => {
    const l = parseGeoJsonLayer(fc([{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] } }]), opts)
    expect(l.features.map((f) => f.properties._id)).toEqual(['L|0|0', 'L|0|1'])
  })

  it('acepta un Feature o una geometría suelta y descarta coordenadas inválidas', () => {
    expect(parseGeoJsonLayer(JSON.stringify({ type: 'Point', coordinates: [1, 2] }), opts).features).toHaveLength(1)
    expect(() => parseGeoJsonLayer(fc([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 200] } }]), opts)).toThrow(LayerFormatError)
  })

  it('rechaza lo que no es GeoJSON', () => {
    expect(() => parseGeoJsonLayer('no', opts)).toThrow(LayerFormatError)
    expect(() => parseGeoJsonLayer('{"a":1}', opts)).toThrow(LayerFormatError)
  })
})

describe('GPX', () => {
  const l = parseGpxLayer(fx('lances.gpx'), xml, opts)

  it('lee tracks, rutas y waypoints aunque las fechas sean inválidas', () => {
    const kinds = l.features.map((f) => f.geometry.type)
    expect(kinds.filter((k) => k === 'LineString')).toHaveLength(2)
    expect(kinds.filter((k) => k === 'Point')).toHaveLength(4) // 2 wpt válidos + 2 rtept
  })

  it('usa el color Garmin del track y el de la capa en lo demás', () => {
    const track = l.features.find((f) => f.properties._title === 'Lance 1')!
    expect(track.properties._stroke).toBe('#ff00ff')
    expect(l.props[track.properties._id]).toMatchObject({ name: 'Lance 1', desc: 'Virada 11:10' })
    const wpt = l.features.find((f) => f.properties._title === 'Lance 1 inicio')!
    expect(wpt.properties._color).toBe('#3366ff')
    expect(l.descriptions.map((d) => d.properties.text)).toEqual(['Calado 08:10'])
  })

  it('ocultar una línea oculta también los puntos de sus extremos', () => {
    const track = l.features.find((f) => f.properties._title === 'Lance 1')!
    const ids = relatedFeatureIds(l, track.properties._id)
    const names = ids.map((id) => l.features.find((f) => f.properties._id === id)!.properties._title)
    expect(names.sort()).toEqual(['Lance 1', 'Lance 1 fin', 'Lance 1 inicio'])
    const marked = withHidden(l.features, new Set(ids))
    expect(marked.filter((f) => f.properties._hidden)).toHaveLength(3)
  })

  it('punto representativo para navegar', () => {
    const track = l.features.find((f) => f.properties._title === 'Lance 1')!
    expect(featureAnchor(track)).toEqual([-65.35, -46.15])
  })

  it('rechaza XML que no es GPX', () => {
    expect(() => parseGpxLayer('<kml/>', xml, opts)).toThrow(LayerFormatError)
  })
})

describe('reglas de etiquetas', () => {
  it('como en Flutter', () => {
    expect(areaLabel('areasLangostino', { Id_area: 'Subárea 7' })).toBe('7')
    expect(areaLabel('areasVieira', { name: 'UM_Vieira_RES_5_14_A1' })).toBe('A1')
    expect(areaLabel('areasCentolla', {}, 'area_centolla_S3.geojson')).toBe('S3')
    expect(areaLabel(undefined, { name: 'x' })).toBeNull()
  })
})

describe('visibilidad inicial de las capas base', () => {
  it('costas, límites y vedas encendidos; vieira, centolla y langostino apagados', () => {
    expect(DEFAULT_BASE_VISIBLE).toEqual({
      mapaBase: true,
      areasGenerales: true,
      zonasVeda: true,
      areasVieira: false,
      areasCentolla: false,
      areasLangostino: false,
    })
  })
  it('define un valor para cada grupo', () => {
    expect(Object.keys(DEFAULT_BASE_VISIBLE).sort()).toEqual([...BASE_GROUPS].sort())
  })
})
