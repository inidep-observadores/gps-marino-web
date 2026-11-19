/**
 * Geometría sobre la esfera (WGS84 aproximado por una esfera de radio medio).
 * La app Flutter usaba `geolocator` (elipsoide en Android); la diferencia con la esfera es < 0,5 %,
 * despreciable para distancias y rumbos de navegación costera y de altura.
 */

export interface LatLon {
  lat: number
  lon: number
}

/** Radio medio terrestre (IUGG), en metros. */
export const EARTH_RADIUS_M = 6_371_008.8
/** Metros por milla náutica. */
export const METERS_PER_NM = 1852
/** m/s → nudos. */
export const MS_TO_KN = 3600 / METERS_PER_NM

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Normaliza un ángulo a [0, 360). */
export function normalizeDeg(a: number): number {
  const r = a % 360
  return r < 0 ? r + 360 : r === 360 ? 0 : r
}

/** Diferencia angular mínima entre dos rumbos, en [0, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeDeg(a) - normalizeDeg(b))
  return d > 180 ? 360 - d : d
}

/** Distancia ortodrómica (haversine) en metros. */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Distancia en millas náuticas. */
export const distanceNm = (a: LatLon, b: LatLon): number => distanceM(a, b) / METERS_PER_NM

/** Rumbo inicial (marcación verdadera) de `a` hacia `b`, en [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = rad(a.lat)
  const φ2 = rad(b.lat)
  const Δλ = rad(b.lon - a.lon)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return normalizeDeg(deg(Math.atan2(y, x)))
}

/** Punto al que se llega desde `from` navegando `distanceNm` con rumbo inicial `bearing` (línea COG, anillos). */
export function destinationPoint(from: LatLon, bearing: number, distanceNmValue: number): LatLon {
  const δ = (distanceNmValue * METERS_PER_NM) / EARTH_RADIUS_M
  const θ = rad(bearing)
  const φ1 = rad(from.lat)
  const λ1 = rad(from.lon)
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ))
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2))
  return { lat: deg(φ2), lon: ((deg(λ2) + 540) % 360) - 180 }
}
