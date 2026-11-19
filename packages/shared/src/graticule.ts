import type { Bounds } from './tiles'

/**
 * Cuadrícula de latitud y longitud ("grilla de graduación") para el mapa. Pura: sin MapLibre ni DOM.
 * - `adaptive`: elige el paso según el zoom, para que las líneas queden separadas ~90 px (suave, no invasiva).
 * - `deg1` / `deg05`: paso fijo de 1° o ½°; si el mapa está muy alejado y quedarían demasiadas líneas, se usa el paso
 *   siguiente más grande que sí entre (nunca se dibujan cientos de líneas).
 */
export type GraticuleMode = 'adaptive' | 'deg1' | 'deg05'
export const GRATICULE_MODES: readonly GraticuleMode[] = ['adaptive', 'deg1', 'deg05']

/** Pasos posibles, en grados, de mayor a menor: 30°, 20°, 10°, 5°, 2°, 1°, 30′, 20′, 10′, 5′, 2′, 1′. */
export const GRATICULE_STEPS = [30, 20, 10, 5, 2, 1, 0.5, 1 / 3, 1 / 6, 1 / 12, 1 / 30, 1 / 60] as const

/** Separación objetivo entre líneas (px) en modo adaptativo y mínima en los modos fijos. */
export const GRATICULE_TARGET_PX = 90
export const GRATICULE_MIN_PX = 28

const MAX_LAT = 85

export interface GraticuleViewport {
  widthPx: number
  heightPx: number
}

const lonSpan = (b: Bounds) => (b.east >= b.west ? b.east - b.west : b.east + 360 - b.west)

/** Paso (grados) de la cuadrícula para la vista actual. */
export function graticuleStep(view: Bounds, viewport: GraticuleViewport, mode: GraticuleMode): number {
  const spanLon = Math.max(lonSpan(view), 1e-9)
  const spanLat = Math.max(view.north - view.south, 1e-9)
  const w = Math.max(viewport.widthPx, 1)
  const h = Math.max(viewport.heightPx, 1)
  if (mode === 'adaptive') {
    const target = (spanLon * GRATICULE_TARGET_PX) / w
    // El paso más fino que todavía deja las líneas separadas al menos `GRATICULE_TARGET_PX`.
    return [...GRATICULE_STEPS].reverse().find((s) => s >= target) ?? GRATICULE_STEPS[0]
  }
  const wanted = mode === 'deg1' ? 1 : 0.5
  // El menor de los pasos admitidos que no sea más fino que el pedido y deje las líneas a una distancia razonable.
  const candidates = [...GRATICULE_STEPS].reverse().filter((s) => s >= wanted - 1e-9)
  return candidates.find((s) => (spanLon / s) * GRATICULE_MIN_PX <= w && (spanLat / s) * GRATICULE_MIN_PX <= h) ?? GRATICULE_STEPS[0]
}

/** Múltiplos de `step` dentro de [min, max] (sin errores de coma flotante: se redondea al segundo de arco). */
export function graticuleValues(min: number, max: number, step: number): number[] {
  const out: number[] = []
  const first = Math.ceil(min / step - 1e-9)
  for (let k = first; k * step <= max + 1e-9 && out.length < 500; k++) out.push(Math.round(k * step * 3600) / 3600)
  return out
}

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/** Etiqueta de una línea: `38°S` con pasos de grado entero y `38°30′S` con pasos menores. */
export function formatGraticuleLabel(value: number, axis: 'lat' | 'lon', step: number, west = 'O'): string {
  const v = axis === 'lon' ? wrapLon(value) : value
  const hemi = axis === 'lat' ? (v < 0 ? 'S' : 'N') : v < 0 ? west : 'E'
  const totalMin = Math.round(Math.abs(v) * 60)
  const deg = Math.floor(totalMin / 60)
  const min = totalMin % 60
  if (step >= 1 - 1e-9 || min === 0) return `${deg}°${hemi}`
  return `${deg}°${String(min).padStart(2, '0')}′${hemi}`
}

export interface GraticuleOptions {
  /** Latitud donde se ubican las etiquetas de los meridianos (el borde superior visible). */
  lonLabelLat: number
  /** Longitud donde se ubican las etiquetas de los paralelos (el borde izquierdo visible). */
  latLabelLon: number
  /** Letra del oeste ('O' en español, 'W' en inglés). */
  west?: string
}

export interface GraticuleFeatures {
  step: number
  lines: {
    type: 'FeatureCollection'
    features: { type: 'Feature'; properties: { axis: 'lat' | 'lon' }; geometry: { type: 'LineString'; coordinates: [number, number][] } }[]
  }
  labels: {
    type: 'FeatureCollection'
    features: { type: 'Feature'; properties: { axis: 'lat' | 'lon'; text: string }; geometry: { type: 'Point'; coordinates: [number, number] } }[]
  }
}

/** Líneas y etiquetas de la cuadrícula para la vista (los meridianos y paralelos se extienden un poco más allá del borde). */
export function buildGraticule(view: Bounds, viewport: GraticuleViewport, mode: GraticuleMode, opts: GraticuleOptions): GraticuleFeatures {
  const step = graticuleStep(view, viewport, mode)
  const padLon = lonSpan(view) * 0.1
  const padLat = (view.north - view.south) * 0.1
  const south = Math.max(view.south - padLat, -MAX_LAT)
  const north = Math.min(view.north + padLat, MAX_LAT)
  const eastView = view.east >= view.west ? view.east : view.east + 360
  const west = view.west - padLon
  const east = eastView + padLon
  const lines: GraticuleFeatures['lines']['features'] = []
  const labels: GraticuleFeatures['labels']['features'] = []
  const w = opts.west ?? 'O'

  for (const lat of graticuleValues(Math.max(view.south, -MAX_LAT), Math.min(view.north, MAX_LAT), step)) {
    lines.push({ type: 'Feature', properties: { axis: 'lat' }, geometry: { type: 'LineString', coordinates: [[west, lat], [east, lat]] } })
    labels.push({ type: 'Feature', properties: { axis: 'lat', text: formatGraticuleLabel(lat, 'lat', step, w) }, geometry: { type: 'Point', coordinates: [opts.latLabelLon, lat] } })
  }
  for (const lon of graticuleValues(view.west, eastView, step)) {
    lines.push({ type: 'Feature', properties: { axis: 'lon' }, geometry: { type: 'LineString', coordinates: [[lon, south], [lon, north]] } })
    labels.push({ type: 'Feature', properties: { axis: 'lon', text: formatGraticuleLabel(lon, 'lon', step, w) }, geometry: { type: 'Point', coordinates: [lon, opts.lonLabelLat] } })
  }
  return { step, lines: { type: 'FeatureCollection', features: lines }, labels: { type: 'FeatureCollection', features: labels } }
}
