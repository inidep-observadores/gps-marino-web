import { useI18n } from 'vue-i18n'
import { formatBearing, formatLat, formatLon } from '@gpsm/shared'

/** Formatos de pantalla según el idioma. Los valores internos nunca se guardan formateados. */
export function useFormat() {
  const { locale, t } = useI18n()

  const num = (v: number, digits: number) =>
    new Intl.NumberFormat(locale.value, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)

  return {
    lat: (v: number | null | undefined) => formatLat(v),
    lon: (v: number | null | undefined) => formatLon(v, { west: t('units.west') }),
    bearing: (v: number | null | undefined) => formatBearing(v),
    /** Nudos con un decimal (sin unidad). */
    speed: (kn: number | null | undefined) => (kn == null ? '--' : num(kn, 1)),
    /** Millas náuticas con dos decimales (sin unidad), como la app original. */
    distance: (nm: number | null | undefined) => (nm == null ? '--' : num(nm, 2)),
    meters: (m: number | null | undefined) => (m == null ? '--' : num(m, 0)),
    date: (ms: number | null | undefined) =>
      ms == null ? '--/--/----' : new Date(ms).toLocaleDateString(locale.value, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: (ms: number | null | undefined) =>
      ms == null ? '--:--' : new Date(ms).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false }),
    dateTime: (ms: number) =>
      new Date(ms).toLocaleString(locale.value, { dateStyle: 'short', timeStyle: 'short', hour12: false }),
  }
}
