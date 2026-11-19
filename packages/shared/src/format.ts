/**
 * Formatos de lectura náutica, iguales a los de la app Flutter (`geo_string_format.dart`):
 * coordenadas en grados y minutos con tres decimales (`38° 00,330' S`), rumbo con tres cifras (`045°`).
 * Las funciones son puras; el idioma solo cambia la letra del oeste (O/W) y el separador decimal.
 */

export interface CoordFormatOptions {
  /** Letra para el oeste: `O` en español, `W` en inglés. */
  west?: string
  /** Separador decimal de los minutos (la app original usa coma). */
  decimal?: string
}

export interface DegMin {
  deg: number
  /** Minutos con decimales, en [0, 60). */
  min: number
  /** `true` para sur u oeste. */
  negative: boolean
}

/** Grados decimales → grados enteros + minutos (redondeados a `decimals`), con acarreo correcto (59,9996' → 1°). */
export function toDegMin(value: number, decimals = 3): DegMin {
  const negative = value < 0
  const scale = 10 ** decimals
  const totalMin = Math.round(Math.abs(value) * 60 * scale)
  const perDeg = 60 * scale
  return { deg: Math.floor(totalMin / perDeg), min: (totalMin % perDeg) / scale, negative }
}

/** Grados + minutos + hemisferio → grados decimales (lo usa el formulario de edición). */
export function fromDegMin(deg: number, min: number, negative: boolean): number {
  const v = Math.abs(deg) + Math.abs(min) / 60
  return negative ? -v : v
}

function formatCoord(value: number, pos: string, neg: string, opts: CoordFormatOptions): string {
  const { deg, min, negative } = toDegMin(value)
  const [mi, md] = min.toFixed(3).split('.') as [string, string]
  return `${deg}° ${mi.padStart(2, '0')}${opts.decimal ?? ','}${md}' ${negative ? neg : pos}`
}

export const EMPTY_LAT = "--° --,---' -"
export const EMPTY_LON = "---° --,---' -"

export function formatLat(lat: number | null | undefined, opts: CoordFormatOptions = {}): string {
  return lat == null || !Number.isFinite(lat) ? EMPTY_LAT : formatCoord(lat, 'N', 'S', opts)
}

export function formatLon(lon: number | null | undefined, opts: CoordFormatOptions = {}): string {
  return lon == null || !Number.isFinite(lon) ? EMPTY_LON : formatCoord(lon, 'E', opts.west ?? 'O', opts)
}

/** Rumbo con tres cifras y sin decimales: `5.6` → `006°`. Sin dato: `---`. */
export function formatBearing(bearing: number | null | undefined): string {
  if (bearing == null || !Number.isFinite(bearing)) return '---'
  const r = Math.round(bearing) % 360
  return `${String(r).padStart(3, '0')}°`
}
