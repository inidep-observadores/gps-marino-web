/**
 * Normaliza un texto para búsquedas insensibles a mayúsculas y acentos:
 * "termo" encuentra "Termógrafo" y "nandu" encuentra "Ñandú".
 */
export function normalizeForSearch(input: string): string {
  return input.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** ¿`text` contiene `query`? Ambos normalizados; una consulta vacía coincide con todo. */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalizeForSearch(query)
  return q === '' || normalizeForSearch(text).includes(q)
}
