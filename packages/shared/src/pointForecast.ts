import { HOUR_MS } from './wind'

/**
 * Pronóstico horario de UN punto: viento y ráfagas (Open-Meteo Forecast) y olas (Open-Meteo Marine).
 * Todo en unidades del SI (m/s, m, s, grados "desde dónde viene"); en UTC para indexar por instante.
 * El pronóstico marino puede no existir (puntos en tierra o sin cobertura): las olas quedan en `null`.
 */
export const OPEN_METEO_MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'

export interface PointHour {
  /** Inicio de la hora (ms UTC). */
  t: number
  windMs: number | null
  gustMs: number | null
  windDir: number | null
  /** Altura significativa de la ola total (m), período (s) y dirección de la que viene. */
  waveH: number | null
  waveT: number | null
  waveDir: number | null
  /** Mar de fondo (swell). */
  swellH: number | null
  swellT: number | null
  swellDir: number | null
}

export interface PointForecast {
  lat: number
  lon: number
  hours: PointHour[]
  /** Hay datos de olas para este punto. */
  hasWaves: boolean
  /** Cuándo se obtuvo (ms); puede ser anterior si salió del caché sin conexión. */
  fetchedAt: number
}

const common = (lat: number, lon: number, days: number) => ({
  latitude: lat.toFixed(4),
  longitude: lon.toFixed(4),
  timezone: 'GMT',
  forecast_days: String(Math.min(16, Math.max(1, days))),
})

export function buildPointWindUrl(lat: number, lon: number, days: number, baseUrl = 'https://api.open-meteo.com/v1/forecast'): string {
  const p = new URLSearchParams({ ...common(lat, lon, days), hourly: 'wind_speed_10m,wind_gusts_10m,wind_direction_10m', wind_speed_unit: 'ms' })
  return `${baseUrl}?${p.toString()}`
}

export function buildPointWaveUrl(lat: number, lon: number, days: number, baseUrl = OPEN_METEO_MARINE_URL): string {
  const p = new URLSearchParams({
    ...common(lat, lon, days),
    hourly: 'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction',
  })
  return `${baseUrl}?${p.toString()}`
}

type Series = Array<number | null> | undefined
interface HourlyResponse {
  hourly?: { time?: string[] } & Record<string, Series | string[]>
}

const val = (a: Series, i: number): number | null => {
  const v = a?.[i]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Une las dos respuestas. `waves` puede ser `null` (sin cobertura marina o sin conexión a ese servicio). */
export function parsePointForecast(wind: HourlyResponse, waves: HourlyResponse | null, lat: number, lon: number, fetchedAt = Date.now()): PointForecast {
  const wt = wind.hourly?.time
  if (!wt?.length) throw new Error('point-forecast-empty')
  const w = wind.hourly as Record<string, Series>
  const m = (waves?.hourly ?? null) as Record<string, Series | string[]> | null
  // Las olas se alinean por instante (las dos respuestas piden las mismas horas, pero no se da por hecho).
  const waveIndex = new Map<number, number>()
  ;(m?.time as string[] | undefined)?.forEach((s, i) => waveIndex.set(Date.parse(`${s}Z`), i))
  const hours: PointHour[] = wt.map((s, i) => {
    const t = Date.parse(`${s}Z`)
    const j = waveIndex.get(t)
    const mv = (k: string) => (j == null ? null : val(m?.[k] as Series, j))
    return {
      t,
      windMs: val(w.wind_speed_10m, i),
      gustMs: val(w.wind_gusts_10m, i),
      windDir: val(w.wind_direction_10m, i),
      waveH: mv('wave_height'),
      waveT: mv('wave_period'),
      waveDir: mv('wave_direction'),
      swellH: mv('swell_wave_height'),
      swellT: mv('swell_wave_period'),
      swellDir: mv('swell_wave_direction'),
    }
  })
  return { lat, lon, hours, hasWaves: hours.some((h) => h.waveH != null), fetchedAt }
}

/** Horas desde `from` (en punto) en adelante. */
export function hoursFrom(f: PointForecast, from: number): PointHour[] {
  const start = Math.floor(from / HOUR_MS) * HOUR_MS
  return f.hours.filter((h) => h.t >= start)
}

/** Hora del pronóstico más cercana a `t`. */
export function hourAt(f: PointForecast, t: number): PointHour | null {
  let best: PointHour | null = null
  for (const h of f.hours) if (!best || Math.abs(h.t - t) < Math.abs(best.t - t)) best = h
  return best
}

/** Escala "agradable" para el eje vertical: máximo redondeado hacia arriba y marcas. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  const raw = Math.max(max, 1e-9) / ticks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow
  return { max: Math.ceil(max / step) * step || step, step }
}
