import type { RoutePoint } from './domain'
import { angleDiff, bearingDeg, distanceNm, type LatLon } from './geo'

/**
 * Navegación por ruta, portada de `geolocation_bloc.dart` de la app Flutter.
 * La ruta es una lista ordenada de puntos; el primero es el próximo a alcanzar.
 */

/** Llegada directa: dentro de este radio el punto se da por alcanzado (≈ 185 m). */
export const ARRIVAL_RADIUS_NM = 0.1
/** Zona de "línea de través" (≈ 500 m): se da por pasado si ya quedó por detrás del través. */
export const ABEAM_ZONE_NM = 0.27
/** Velocidad mínima para confiar en el rumbo al evaluar el través. */
export const ABEAM_MIN_SPEED_KN = 1
/** Diferencia mínima entre el rumbo y la marcación al punto para considerarlo pasado (por detrás del través). */
export const ABEAM_ANGLE_DEG = 110

export interface NavFix extends LatLon {
  /** Velocidad en nudos (la que se muestra, promediada). */
  speedKn: number | null
  /** Rumbo sobre el fondo, o `null` si no se conoce. */
  courseDeg: number | null
}

export interface RouteLeg {
  point: RoutePoint
  /** Distancia del tramo (desde la posición o el punto anterior), Nm. */
  distanceNm: number
  /** Rumbo del tramo. */
  bearingDeg: number
}

/** Tramos desde la posición actual recorriendo la ruta en orden. */
export function routeLegs(from: LatLon, route: readonly RoutePoint[]): RouteLeg[] {
  let current = from
  return route.map((point) => {
    const leg = { point, distanceNm: distanceNm(current, point), bearingDeg: bearingDeg(current, point) }
    current = point
    return leg
  })
}

/** Distancia total desde la posición hasta el final de la ruta (Nm). */
export const routeDistanceNm = (from: LatLon, route: readonly RoutePoint[]): number =>
  routeLegs(from, route).reduce((acc, l) => acc + l.distanceNm, 0)

/** Hora estimada de llegada (ms) para recorrer `nm` a `speedKn`. `null` si la velocidad es casi nula. */
export function etaMs(nm: number, speedKn: number | null, from: number): number | null {
  if (speedKn == null || !Number.isFinite(speedKn) || speedKn < 0.1) return null
  return from + (nm / speedKn) * 3_600_000
}

/** ¿Se puede dar por alcanzado el punto? Llegada directa o ya quedó por detrás del través. */
export function hasReached(fix: NavFix, target: LatLon): boolean {
  const d = distanceNm(fix, target)
  if (d <= ARRIVAL_RADIUS_NM) return true
  if (d <= ABEAM_ZONE_NM && (fix.speedKn ?? 0) > ABEAM_MIN_SPEED_KN && fix.courseDeg != null) {
    return angleDiff(fix.courseDeg, bearingDeg(fix, target)) > ABEAM_ANGLE_DEG
  }
  return false
}

export interface ArrivalSettings {
  /** Avisar al aproximarse. */
  notifyArrival: boolean
  /** Distancia de aviso (Nm). */
  arrivalDistanceNm: number
  /** Avisar en cada punto; si es `false`, solo en el destino final. */
  notifyAllPoints: boolean
}

export const DEFAULT_ARRIVAL_SETTINGS: ArrivalSettings = {
  notifyArrival: true,
  arrivalDistanceNm: 0.5,
  notifyAllPoints: true,
}

/** Clave estable de un punto, para no avisar dos veces por el mismo. */
export const pointKey = (p: LatLon): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`

export interface RouteStep {
  route: RoutePoint[]
  /** Punto por el que hay que avisar ahora (o `null`). */
  notify: RoutePoint | null
  /** Clave del último punto avisado (se guarda para la próxima llamada). */
  lastNotifiedKey: string | null
  /** El primer punto se dio por alcanzado y se pasó al siguiente. */
  advanced: boolean
}

/**
 * Un paso de navegación con un nuevo fix: decide el aviso de arribo y si se avanza al siguiente punto.
 * Igual que en la app original, el último punto nunca se quita solo (queda como destino hasta cancelarlo).
 */
export function stepRoute(
  route: readonly RoutePoint[],
  fix: NavFix,
  settings: ArrivalSettings,
  lastNotifiedKey: string | null,
): RouteStep {
  const first = route[0]
  if (!first) return { route: [], notify: null, lastNotifiedKey, advanced: false }

  let notify: RoutePoint | null = null
  let key = lastNotifiedKey
  const d = distanceNm(fix, first)
  if (settings.notifyArrival && d <= settings.arrivalDistanceNm && pointKey(first) !== lastNotifiedKey) {
    const isFinal = route.length === 1
    if (isFinal || settings.notifyAllPoints) {
      notify = first
      key = pointKey(first)
    }
  }

  const advanced = route.length > 1 && hasReached(fix, first)
  return { route: advanced ? route.slice(1) : [...route], notify, lastNotifiedKey: key, advanced }
}
