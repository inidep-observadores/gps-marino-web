import { i18n } from './index'

/** Número con `digits` decimales según el idioma actual (coma en español, punto en inglés). Para stores y fuera de componentes. */
export function formatNumber(value: number, digits: number): string {
  return new Intl.NumberFormat(i18n.global.locale.value, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** Distancia en millas náuticas con su unidad en el idioma actual: `0,25 Mn` / `0.25 Nm`. */
export function formatNm(nm: number, maxDigits = 2): string {
  const n = new Intl.NumberFormat(i18n.global.locale.value, { maximumFractionDigits: maxDigits }).format(nm)
  return `${n} ${i18n.global.t('units.nm')}`
}
