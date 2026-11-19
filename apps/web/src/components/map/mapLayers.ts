import type { ExpressionSpecification, GeoJSONSource, Map as MapLibre } from 'maplibre-gl'
import { withHidden, type ImportedLayer } from '@gpsm/shared'
import { LAYER_TOKENS } from '@/layers/baseLayers'
import type { RenderLayer } from '@/stores/layers'
import { LABEL_FONT, LABEL_FONT_BOLD, tokenColor, type Palette } from './mapStyles'

/**
 * Capas vectoriales (base e importadas) en MapLibre. Cada capa del usuario o grupo base es una fuente GeoJSON con:
 * relleno de áreas, líneas (y bordes), puntos, etiquetas de áreas y descripciones de puntos (estas dos en fuentes
 * propias: si faltan las tipografías sin conexión, los símbolos de una fuente se descartan juntos).
 * Se dibujan debajo de lo propio del mapa (anillos, ruta, ubicaciones, buque).
 */

export interface LayerRenderOptions {
  colors: Palette
  showLabels: boolean
  imported: ImportedLayer[]
}

/** Prefijos de las capas MapLibre que se pueden tocar (líneas y puntos, como en Flutter; las áreas no). */
export const TAPPABLE_SUFFIXES = ['-line', '-point'] as const

/** Color por defecto de cada token del tema, resuelto ahora (cambia con el tema). */
function colorExpr(prop: '_stroke' | '_fill' | '_color'): ExpressionSpecification {
  const match: unknown[] = ['match', ['get', '_tok']]
  for (const tok of LAYER_TOKENS) match.push(tok, tokenColor(tok))
  match.push(tokenColor('--ds-ink-muted'))
  return ['case', ['==', ['coalesce', ['get', prop], ''], ''], match, ['get', prop]] as unknown as ExpressionSpecification
}

const hidden = (whenHidden: number, otherwise: ExpressionSpecification | number) =>
  ['case', ['==', ['get', '_hidden'], true], whenHidden, otherwise] as unknown as ExpressionSpecification

const EMPTY = { type: 'FeatureCollection' as const, features: [] }

function featureData(r: RenderLayer, imported: ImportedLayer[]) {
  const layer = r.layerId ? imported.find((l) => l.id === r.layerId) : undefined
  const features = layer?.hiddenFeatures.length ? withHidden(r.parsed.features, new Set(layer.hiddenFeatures)) : r.parsed.features
  return { type: 'FeatureCollection' as const, features }
}

function labelData(r: RenderLayer, opts: LayerRenderOptions) {
  return opts.showLabels ? { type: 'FeatureCollection' as const, features: r.parsed.labels } : EMPTY
}

function descData(r: RenderLayer, opts: LayerRenderOptions) {
  const layer = r.layerId ? opts.imported.find((l) => l.id === r.layerId) : undefined
  if (!layer?.showDescriptions) return EMPTY
  const hiddenIds = new Set(layer.hiddenFeatures)
  return { type: 'FeatureCollection' as const, features: r.parsed.descriptions.filter((d) => !hiddenIds.has(d.properties._for)) }
}

/** Ids de capas MapLibre que crea una fuente (para quitarlas). */
const layerIds = (s: string) => [`${s}-fill`, `${s}-line`, `${s}-point`, `${s}-label`, `${s}-desc`]

function addRenderLayer(m: MapLibre, r: RenderLayer, opts: LayerRenderOptions, before: string | undefined) {
  const s = r.sourceId
  const c = opts.colors
  m.addSource(s, { type: 'geojson', data: featureData(r, opts.imported) as never, promoteId: '_id' })
  m.addSource(`${s}-labels`, { type: 'geojson', data: labelData(r, opts) as never })
  m.addSource(`${s}-descs`, { type: 'geojson', data: descData(r, opts) as never })

  m.addLayer(
    {
      id: `${s}-fill`,
      type: 'fill',
      source: s,
      filter: ['==', ['get', '_kind'], 'polygon'],
      paint: { 'fill-color': colorExpr('_fill'), 'fill-opacity': hidden(0.03, ['get', '_fillOpacity']) },
    },
    before,
  )
  m.addLayer(
    {
      id: `${s}-line`,
      type: 'line',
      source: s,
      filter: ['!=', ['get', '_kind'], 'point'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': colorExpr('_stroke'),
        'line-width': ['get', '_strokeWidth'],
        'line-opacity': hidden(0.1, ['get', '_strokeOpacity']),
        ...(r.dashed ? { 'line-dasharray': [3, 2] } : {}),
      },
    },
    before,
  )
  m.addLayer(
    {
      id: `${s}-point`,
      type: 'circle',
      source: s,
      filter: ['==', ['get', '_kind'], 'point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3.5, 12, 6],
        'circle-color': colorExpr('_color'),
        'circle-stroke-color': c.surface,
        'circle-stroke-width': 1.5,
        'circle-opacity': hidden(0.3, 1),
        'circle-stroke-opacity': hidden(0.3, 1),
      },
    },
    before,
  )
  // Etiquetas de áreas: letra grande con borde, como en Flutter.
  m.addLayer(
    {
      id: `${s}-label`,
      type: 'symbol',
      source: `${s}-labels`,
      layout: { 'text-field': ['get', 'text'], 'text-font': LABEL_FONT_BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 9, 16], 'text-allow-overlap': false },
      paint: { 'text-color': c.ink, 'text-halo-color': c.canvas, 'text-halo-width': 2 },
    },
    before,
  )
  // Descripciones de puntos: chicas, arriba del punto, con halo del color opuesto al texto.
  m.addLayer(
    {
      id: `${s}-desc`,
      type: 'symbol',
      source: `${s}-descs`,
      layout: { 'text-field': ['get', 'text'], 'text-font': LABEL_FONT, 'text-size': 11, 'text-anchor': 'bottom', 'text-offset': [0, -0.7], 'text-max-width': 12, 'text-optional': true },
      paint: { 'text-color': c.ink, 'text-halo-color': c.canvas, 'text-halo-width': 1.5 },
    },
    before,
  )
}

/**
 * Deja el mapa con exactamente las capas pedidas: agrega las nuevas, actualiza los datos de las existentes y quita
 * las que ya no están. `before` = primera capa propia del mapa (las vectoriales quedan debajo).
 */
export function syncVectorLayers(m: MapLibre, layers: RenderLayer[], opts: LayerRenderOptions, before?: string) {
  const want = new Set(layers.map((l) => l.sourceId))
  // Quitar las que sobran.
  const style = m.getStyle()
  for (const id of Object.keys(style?.sources ?? {})) {
    if (!/^(base|imp)-/.test(id) || id.endsWith('-labels') || id.endsWith('-descs')) continue
    if (want.has(id)) continue
    for (const l of layerIds(id)) if (m.getLayer(l)) m.removeLayer(l)
    for (const src of [id, `${id}-labels`, `${id}-descs`]) if (m.getSource(src)) m.removeSource(src)
  }
  const beforeId = before && m.getLayer(before) ? before : undefined
  for (const r of layers) {
    const src = m.getSource(r.sourceId) as GeoJSONSource | undefined
    if (!src) {
      addRenderLayer(m, r, opts, beforeId)
      continue
    }
    src.setData(featureData(r, opts.imported) as never)
    ;(m.getSource(`${r.sourceId}-labels`) as GeoJSONSource | undefined)?.setData(labelData(r, opts) as never)
    ;(m.getSource(`${r.sourceId}-descs`) as GeoJSONSource | undefined)?.setData(descData(r, opts) as never)
  }
  // Mantener el orden pedido (grupos base abajo, importadas arriba) aunque se hayan agregado en otro momento.
  if (beforeId) for (const r of layers) for (const l of layerIds(r.sourceId)) if (m.getLayer(l)) m.moveLayer(l, beforeId)
}

/** Ids de capas MapLibre tocables que existen ahora. */
export function tappableLayerIds(m: MapLibre, layers: RenderLayer[]): string[] {
  return layers.flatMap((r) => TAPPABLE_SUFFIXES.map((suf) => `${r.sourceId}${suf}`)).filter((id) => m.getLayer(id))
}
