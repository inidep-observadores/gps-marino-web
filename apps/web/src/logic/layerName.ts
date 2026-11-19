/** Largo máximo del nombre de una capa (el mismo que valida el esquema compartido). */
export const LAYER_NAME_MAX = 200

export type LayerNameResult = { ok: true; name: string } | { ok: false; error: 'empty' | 'exists' }

/**
 * Valida el nombre nuevo de una capa importada: sin espacios sobrantes, no vacío y distinto del de las demás capas
 * (sin distinguir mayúsculas, igual que al importar: un nombre repetido sobrescribiría la otra capa).
 * Dejar el mismo nombre (aunque cambien las mayúsculas) es válido.
 */
export function validateLayerName(input: string, others: readonly string[]): LayerNameResult {
  const name = input.trim().replace(/\s+/g, ' ').slice(0, LAYER_NAME_MAX)
  if (!name) return { ok: false, error: 'empty' }
  const lower = name.toLowerCase()
  if (others.some((o) => o.toLowerCase() === lower)) return { ok: false, error: 'exists' }
  return { ok: true, name }
}
