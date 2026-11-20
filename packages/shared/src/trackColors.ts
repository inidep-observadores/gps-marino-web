/**
 * Colores de las derrotas: una paleta fija (en la web, los tokens `--ds-track-0…9`) y un índice por derrota. Al crear una
 * derrota se elige un color de los MENOS usados (al azar entre ellos), así varias derrotas juntas en el mapa no repiten
 * color hasta agotar la paleta.
 */
export const TRACK_COLOR_COUNT = 10

/** Índice de color para una derrota nueva: aleatorio entre los menos usados de `used`. */
export function pickTrackColor(used: readonly (number | null | undefined)[], random: () => number = Math.random): number {
  const counts = Array.from({ length: TRACK_COLOR_COUNT }, () => 0)
  for (const u of used) if (u != null && u >= 0 && u < TRACK_COLOR_COUNT) counts[u]!++
  const min = Math.min(...counts)
  const candidates = counts.flatMap((n, i) => (n === min ? [i] : []))
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!
}

/** Color efectivo de una derrota: el guardado o, si no tiene (derrotas anteriores), uno estable según su id. */
export function trackColorIndex(id: string, color: number | null | undefined): number {
  if (color != null && color >= 0 && color < TRACK_COLOR_COUNT) return color
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % TRACK_COLOR_COUNT
}
