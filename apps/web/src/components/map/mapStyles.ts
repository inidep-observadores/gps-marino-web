import type { StyleSpecification } from 'maplibre-gl'

/**
 * Tipos de mapa (los de la app Flutter con Google Maps) con fuentes sin clave de API:
 * - `standard`: teselas vectoriales de OpenFreeMap (claro `positron` / oscuro `dark`, según el tema; ver `offlineTiles.ts`).
 * - `satellite`: imágenes de Esri World Imagery.
 * - `hybrid`: satélite + límites y nombres de Esri.
 * - `terrain`: en una app náutica lo útil es el relieve del fondo: batimetría de Esri Ocean + sus referencias.
 * Las teselas vistas con conexión quedan en caché (service worker) y se reutilizan sin conexión.
 * Este módulo no importa MapLibre en tiempo de ejecución (solo tipos).
 */
export const MAP_TYPES = ['standard', 'satellite', 'hybrid', 'terrain'] as const
export type MapType = (typeof MAP_TYPES)[number]

/** Fuentes de OpenFreeMap: las usan las etiquetas propias (anillos, ruta) también sobre los mapas raster. */
export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
export const LABEL_FONT = ['Noto Sans Regular']
export const LABEL_FONT_BOLD = ['Noto Sans Bold']

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const esri = (service: string) => `${ESRI}/${service}/MapServer/tile/{z}/{y}/{x}`
const ESRI_ATTR = 'Esri, Maxar, Earthstar Geographics, GEBCO, NOAA'

export const SEAMARKS_TILES = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'
export const SEAMARKS_ATTR = '© <a href="https://www.openseamap.org" target="_blank" rel="noopener">OpenSeaMap</a>'

function rasterStyle(layers: { id: string; url: string; maxzoom: number }[], background: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: Object.fromEntries(
      layers.map((l) => [l.id, { type: 'raster', tiles: [l.url], tileSize: 256, maxzoom: l.maxzoom, attribution: ESRI_ATTR }]),
    ),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': background } },
      ...layers.map((l) => ({ id: l.id, type: 'raster' as const, source: l.id })),
    ],
  }
}

/** Estilo base de los mapas raster. El estándar (vectorial) lo arma `offlineTiles.loadStandardStyle`. */
export function rasterBaseStyle(type: Exclude<MapType, 'standard'>, background: string): StyleSpecification {
  switch (type) {
    case 'satellite':
      return rasterStyle([{ id: 'imagery', url: esri('World_Imagery'), maxzoom: 19 }], background)
    case 'hybrid':
      return rasterStyle(
        [
          { id: 'imagery', url: esri('World_Imagery'), maxzoom: 19 },
          { id: 'reference', url: esri('Reference/World_Boundaries_and_Places'), maxzoom: 19 },
        ],
        background,
      )
    case 'terrain':
      return rasterStyle(
        [
          // La batimetría de Esri tiene datos hasta z10 (más arriba devuelve "Map data not yet available"): se amplía z10.
          { id: 'ocean', url: esri('Ocean/World_Ocean_Base'), maxzoom: 10 },
          { id: 'ocean-ref', url: esri('Ocean/World_Ocean_Reference'), maxzoom: 10 },
        ],
        background,
      )
  }
}

/**
 * MapLibre no entiende `oklch()`: cada token del tema se convierte a `rgb()` pintándolo en un canvas
 * (igual que en Drone Forecast). Así el mapa usa exactamente los colores de la interfaz.
 */
export function tokenColor(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx || !value) return '#888888'
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

export function palette() {
  return {
    accent: tokenColor('--ds-accent'),
    ink: tokenColor('--ds-ink'),
    inkMuted: tokenColor('--ds-ink-muted'),
    canvas: tokenColor('--ds-canvas'),
    surface: tokenColor('--ds-surface'),
    go: tokenColor('--ds-go'),
    caution: tokenColor('--ds-caution'),
    stop: tokenColor('--ds-stop'),
    markRed: tokenColor('--ds-mark-red'),
    markGreen: tokenColor('--ds-mark-green'),
    markBlue: tokenColor('--ds-mark-blue'),
    markOrange: tokenColor('--ds-mark-orange'),
  }
}
export type Palette = ReturnType<typeof palette>
