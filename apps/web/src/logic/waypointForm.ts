import { fromDegMin, toDegMin, type MarkColor, type MarkIcon, type WaypointInput } from '@gpsm/shared'

/**
 * Valores del formulario de una ubicación, como los edita la app Flutter (`waypoint_edit_fields.dart`):
 * latitud y longitud en grados enteros + minutos con decimales + hemisferio; fecha y hora locales con segundos.
 * Todo como texto (lo que hay en los campos); `parseWaypointForm` valida y convierte.
 */
export interface WaypointFormValues {
  description: string
  latDeg: string
  latMin: string
  /** Sur. */
  latSouth: boolean
  lonDeg: string
  lonMin: string
  /** Oeste. */
  lonWest: boolean
  /** `AAAA-MM-DD` (input type=date). */
  date: string
  /** `HH:MM:SS` (input type=time con segundos). */
  time: string
  speed: string
  bearing: string
  icon: MarkIcon
  color: MarkColor
  visible: boolean
}

export type FormField = keyof WaypointFormValues
/** Códigos de error (los textos están en i18n `waypointForm.errors.*`, iguales a los de Flutter). */
export type FormError = 'required' | 'deg90' | 'deg180' | 'min60' | 'speed' | 'bearing' | 'date' | 'time'

const pad = (n: number, len = 2) => String(n).padStart(len, '0')

/** Texto con coma o punto decimal → número; `null` si está vacío o no es un número. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (!t || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Minutos con hasta 3 decimales, sin ceros de más ("0", "30.5", "12.345"). */
const minText = (m: number) => String(Number(m.toFixed(3)))

export function toFormValues(input: WaypointInput): WaypointFormValues {
  const lat = toDegMin(input.lat)
  const lon = toDegMin(input.lon)
  const d = new Date(input.recordedAt)
  return {
    description: input.description,
    latDeg: String(lat.deg),
    latMin: minText(lat.min),
    latSouth: lat.negative,
    lonDeg: String(lon.deg),
    lonMin: minText(lon.min),
    lonWest: lon.negative,
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    speed: String(Number(input.speedKn.toFixed(2))),
    bearing: String(Math.round(input.bearing)),
    icon: input.icon,
    color: input.color,
    visible: input.visible,
  }
}

export interface ParsedForm {
  errors: Partial<Record<FormField, FormError>>
  /** Solo si no hay errores. */
  input: WaypointInput | null
}

/**
 * Valida y convierte. Los milisegundos de la fecha original se conservan si la hora no cambió
 * (`originalMs`), para no alterar el instante de una ubicación que solo se renombró.
 */
export function parseWaypointForm(v: WaypointFormValues, originalMs?: number): ParsedForm {
  const errors: ParsedForm['errors'] = {}

  const intIn = (field: FormField, s: string, max: number, code: FormError) => {
    const n = parseDecimal(s)
    if (n == null) errors[field] = s.trim() ? code : 'required'
    else if (!Number.isInteger(n) || n < 0 || n > max) errors[field] = code
    return n ?? 0
  }
  const minIn = (field: FormField, s: string) => {
    const n = parseDecimal(s)
    if (n == null) errors[field] = s.trim() ? 'min60' : 'required'
    else if (n < 0 || n >= 60) errors[field] = 'min60'
    return n ?? 0
  }

  const latDeg = intIn('latDeg', v.latDeg, 90, 'deg90')
  const latMin = minIn('latMin', v.latMin)
  const lonDeg = intIn('lonDeg', v.lonDeg, 180, 'deg180')
  const lonMin = minIn('lonMin', v.lonMin)
  // 90° y 180° son el máximo: no admiten minutos.
  if (!errors.latDeg && !errors.latMin && latDeg === 90 && latMin > 0) errors.latMin = 'min60'
  if (!errors.lonDeg && !errors.lonMin && lonDeg === 180 && lonMin > 0) errors.lonMin = 'min60'

  const speed = parseDecimal(v.speed)
  if (speed == null) errors.speed = v.speed.trim() ? 'speed' : 'required'
  else if (speed < 0) errors.speed = 'speed'

  const bearing = parseDecimal(v.bearing)
  if (bearing == null) errors.bearing = v.bearing.trim() ? 'bearing' : 'required'
  else if (!Number.isInteger(bearing) || bearing < 0 || bearing > 360) errors.bearing = 'bearing'

  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.date)
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v.time)
  if (!dm) errors.date = v.date ? 'date' : 'required'
  if (!tm) errors.time = v.time ? 'time' : 'required'
  let recordedAt = 0
  if (dm && tm) {
    const d = new Date(+dm[1]!, +dm[2]! - 1, +dm[3]!, +tm[1]!, +tm[2]!, +(tm[3] ?? 0))
    if (Number.isNaN(d.getTime()) || d.getMonth() !== +dm[2]! - 1) errors.date = 'date'
    recordedAt = d.getTime()
    // Misma fecha y hora al segundo que la original: se conservan sus milisegundos.
    if (originalMs != null && Math.floor(originalMs / 1000) === Math.floor(recordedAt / 1000)) recordedAt = originalMs
  }

  if (Object.keys(errors).length) return { errors, input: null }
  return {
    errors,
    input: {
      description: v.description.trim().slice(0, 500),
      recordedAt,
      lat: fromDegMin(latDeg, latMin, v.latSouth),
      lon: fromDegMin(lonDeg, lonMin, v.lonWest),
      speedKn: speed!,
      bearing: bearing!,
      icon: v.icon,
      color: v.color,
      visible: v.visible,
    },
  }
}

/** ¿Hay cambios respecto de los valores iniciales? (para preguntar antes de cerrar sin guardar) */
export function isDirty(a: WaypointFormValues, b: WaypointFormValues): boolean {
  return (Object.keys(a) as FormField[]).some((k) => a[k] !== b[k])
}
