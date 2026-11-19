/** Geometría SVG para indicadores circulares (de Drone Forecast). Ángulos en grados, 0° = arriba, sentido horario. */

export interface Point {
  x: number
  y: number
}

export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** Path de un arco entre `startDeg` y `endDeg` (horario). Vacío si el arco no tiene longitud. */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  if (endDeg - startDeg <= 0.01) return ''
  const sweep = Math.min(endDeg - startDeg, 359.99)
  const a = polar(cx, cy, r, startDeg)
  const b = polar(cx, cy, r, startDeg + sweep)
  const large = sweep > 180 ? 1 : 0
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** Escala lineal de `[0, max]` a `[startDeg, endDeg]`, recortada a los extremos. */
export function valueToAngle(value: number, max: number, startDeg: number, endDeg: number): number {
  const t = max > 0 ? clamp(value / max, 0, 1) : 0
  return startDeg + t * (endDeg - startDeg)
}

/**
 * Ángulo acumulado para animar una aguja por el camino corto: de 350° a 10° gira +20°, no −340°.
 * Devuelve `previous` más la diferencia más corta hasta `next` (puede salirse de 0–360; solo sirve para `rotate()`).
 */
export function shortestRotation(previous: number, next: number): number {
  const diff = ((((next - previous) % 360) + 540) % 360) - 180
  return previous + diff
}

/** Fondo de escala "redondo" del velocímetro (nudos): crece con la velocidad para que la aguja nunca se salga. */
export function niceSpeedMax(speedKn: number | null): number {
  const v = speedKn ?? 0
  return [10, 15, 20, 30, 40, 60, 100].find((m) => v <= m * 0.92) ?? Math.ceil((v * 1.1) / 50) * 50
}
