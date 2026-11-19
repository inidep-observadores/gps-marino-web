import type { RoutePoint, Waypoint } from './domain'
import { destinationPoint, distanceNm, type LatLon } from './geo'

/**
 * Geometrías GeoJSON para dibujar sobre el mapa (sin depender de MapLibre). Coordenadas GeoJSON = [lon, lat].
 */

export type Position = [number, number]

export interface Feature<G, P = Record<string, unknown>> {
  type: 'Feature'
  geometry: G
  properties: P
}
export interface FeatureCollection<G, P = Record<string, unknown>> {
  type: 'FeatureCollection'
  features: Feature<G, P>[]
}
export interface PointGeom {
  type: 'Point'
  coordinates: Position
}
export interface LineGeom {
  type: 'LineString'
  coordinates: Position[]
}

export const toPos = (p: LatLon): Position => [p.lon, p.lat]
export const emptyCollection = <G, P>(): FeatureCollection<G, P> => ({ type: 'FeatureCollection', features: [] })

/** Círculo geodésico de radio `radiusNm` como anillo cerrado de `steps` lados. */
export function circleRing(center: LatLon, radiusNm: number, steps = 96): Position[] {
  const ring: Position[] = []
  for (let i = 0; i <= steps; i++) ring.push(toPos(destinationPoint(center, (360 * i) / steps, radiusNm)))
  return ring
}

/**
 * Anillos de distancia alrededor del buque (como en la app Flutter: cantidad y separación en Nm).
 * Cada anillo lleva su radio en `radiusNm` y un punto de etiqueta al norte (`labels`).
 */
export function distanceRings(
  center: LatLon,
  count: number,
  spacingNm: number,
): { rings: FeatureCollection<LineGeom, { radiusNm: number }>; labels: FeatureCollection<PointGeom, { radiusNm: number }> } {
  const rings = emptyCollection<LineGeom, { radiusNm: number }>()
  const labels = emptyCollection<PointGeom, { radiusNm: number }>()
  const n = Math.max(0, Math.min(20, Math.floor(count)))
  if (spacingNm <= 0) return { rings, labels }
  for (let i = 1; i <= n; i++) {
    const r = i * spacingNm
    rings.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: circleRing(center, r) }, properties: { radiusNm: r } })
    labels.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: toPos(destinationPoint(center, 0, r)) }, properties: { radiusNm: r } })
  }
  return { rings, labels }
}

/**
 * Línea de proyección del rumbo (COG): adónde llega el buque en `minutes` minutos manteniendo rumbo y velocidad.
 * `null` sin rumbo o detenido.
 */
export function cogLine(from: LatLon, courseDeg: number | null, speedKn: number | null, minutes: number): LineGeom | null {
  if (courseDeg == null || speedKn == null || speedKn < 0.1 || minutes <= 0) return null
  const end = destinationPoint(from, courseDeg, (speedKn * minutes) / 60)
  return { type: 'LineString', coordinates: [toPos(from), toPos(end)] }
}

/** Línea de la ruta desde la posición actual (si la hay) por todos los puntos. */
export function routeLine(from: LatLon | null, route: readonly RoutePoint[]): LineGeom | null {
  const pts = [...(from ? [from] : []), ...route]
  return pts.length >= 2 ? { type: 'LineString', coordinates: pts.map(toPos) } : null
}

/** Puntos de la ruta con su orden y si son el próximo o el final (para dibujar marcadores distintos). */
export function routePoints(route: readonly RoutePoint[]): FeatureCollection<PointGeom, { index: number; role: 'next' | 'final' | 'mid'; name: string }> {
  return {
    type: 'FeatureCollection',
    features: route.map((p, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: toPos(p) },
      properties: { index: i + 1, name: p.name, role: i === route.length - 1 ? 'final' : i === 0 ? 'next' : 'mid' },
    })),
  }
}

/** Ubicaciones visibles en el mapa, con el id de la imagen del ícono (`mark-<ícono>-<color>`). */
export function waypointFeatures(list: readonly Waypoint[]): FeatureCollection<PointGeom, { id: string; image: string; name: string }> {
  return {
    type: 'FeatureCollection',
    features: list
      .filter((w) => w.visible)
      .map((w) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: toPos(w) },
        properties: { id: w.id, image: `mark-${w.icon}-${w.color}`, name: w.description },
      })),
  }
}

/** Distancia total de una polilínea (Nm): herramienta de medición. */
export function polylineNm(points: readonly LatLon[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distanceNm(points[i - 1]!, points[i]!)
  return total
}
