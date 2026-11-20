import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl'
import { TRACK_COLOR_COUNT } from '@gpsm/shared'

/**
 * Tipos de mapa (los de la app Flutter con Google Maps) con fuentes sin clave de API:
 * - `standard`: Argenmap, el mapa base del Instituto Geográfico Nacional (nombres en español, p. ej. "Islas Malvinas");
 *   claro `capabaseargenmap` / oscuro `argenmap_oscuro` según el tema. Teselas raster TMS.
 * - `vector`: teselas vectoriales de OpenFreeMap (claro `positron` / oscuro `dark`, según el tema; ver `offlineTiles.ts`).
 * - `satellite`: imágenes de Esri World Imagery.
 * - `hybrid`: satélite + límites y nombres de Esri.
 * - `terrain`: en una app náutica lo útil es el relieve del fondo: batimetría de Esri Ocean + sus referencias.
 * Las teselas vistas con conexión quedan en caché (service worker) y se reutilizan sin conexión.
 * Este módulo no importa MapLibre en tiempo de ejecución (solo tipos).
 */
export const MAP_TYPES = ['standard', 'vector', 'satellite', 'hybrid', 'terrain'] as const
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

/**
 * Argenmap (IGN): el servicio es TMS (GeoWebCache), con el eje Y invertido respecto de XYZ. Datos abiertos del IGN (CC BY 4.0):
 * hay que citar al Instituto Geográfico Nacional. Las respuestas traen `Cache-Control: no-store`, pero el service worker las
 * guarda igual (ver `vite.config.ts`) porque a bordo no hay red.
 */
const ARGENMAP_BASE = 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0'
export const ARGENMAP_ATTR = '© <a href="https://www.ign.gob.ar" target="_blank" rel="noopener">Instituto Geográfico Nacional</a> · Argenmap'
export const ARGENMAP_MAX_ZOOM = 18
export const ARGENMAP_CACHE = 'map-argenmap-tiles'
export const argenmapLayer = (dark: boolean) => (dark ? 'argenmap_oscuro' : 'capabaseargenmap')
/** Plantilla para MapLibre (`scheme: 'tms'` se encarga de invertir Y). */
export const argenmapTemplate = (dark: boolean) => `${ARGENMAP_BASE}/${argenmapLayer(dark)}@EPSG%3A3857@png/{z}/{x}/{y}.png`
/** URL de una tesela concreta, en coordenadas XYZ (para descargar zonas sin conexión). */
export function argenmapTileUrl(z: number, x: number, y: number, dark: boolean): string {
  const tmsY = 2 ** z - 1 - y
  return `${ARGENMAP_BASE}/${argenmapLayer(dark)}@EPSG%3A3857@png/${z}/${x}/${tmsY}.png`
}

interface RasterLayer {
  id: string
  url: string
  maxzoom: number
  scheme?: 'tms'
  attribution?: string
}

function rasterStyle(layers: RasterLayer[], background: string): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: Object.fromEntries(
      layers.map((l) => [l.id, { type: 'raster', tiles: [l.url], tileSize: 256, maxzoom: l.maxzoom, attribution: l.attribution ?? ESRI_ATTR, ...(l.scheme ? { scheme: l.scheme } : {}) }]),
    ),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': background } },
      ...layers.map((l) => ({ id: l.id, type: 'raster' as const, source: l.id })),
    ],
  }
}

/** Estilo base de los mapas raster. El vectorial (OpenFreeMap) lo arma `offlineTiles.loadStandardStyle`. */
export function rasterBaseStyle(type: Exclude<MapType, 'vector'>, background: string, dark = false): StyleSpecification {
  switch (type) {
    case 'standard':
      return rasterStyle([{ id: 'argenmap', url: argenmapTemplate(dark), maxzoom: ARGENMAP_MAX_ZOOM, scheme: 'tms', attribution: ARGENMAP_ATTR }], background)
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
    /** Colores de las derrotas (índice = `trackColorIndex`). */
    tracks: Array.from({ length: TRACK_COLOR_COUNT }, (_, i) => tokenColor(`--ds-track-${i}`)),
  }
}
export type Palette = ReturnType<typeof palette>

/** Color de una derrota según la propiedad `color` (índice de paleta) de cada elemento. */
export function trackColorExpr(c: Palette): ExpressionSpecification {
  return ['match', ['get', 'color'], ...c.tracks.flatMap((col, i) => [i, col]), c.tracks[0]!] as unknown as ExpressionSpecification
}
