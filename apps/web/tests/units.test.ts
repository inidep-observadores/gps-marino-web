import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en'
import es from '../src/i18n/es'

/** Todas las cadenas de un árbol de mensajes. */
function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node)
  else if (node && typeof node === 'object') for (const v of Object.values(node)) strings(v, out)
  return out
}

describe('unidades por idioma', () => {
  it('milla náutica: Mn en español y Nm en inglés', () => {
    expect(es.units.nm).toBe('Mn')
    expect(en.units.nm).toBe('Nm')
  })

  it('el nudo usa el símbolo estándar (kn) en los dos idiomas y el oeste cambia de letra', () => {
    expect(es.units.kn).toBe('kn')
    expect(en.units.kn).toBe('kn')
    expect(es.units.west).toBe('O')
    expect(en.units.west).toBe('W')
  })

  it('ninguna cadena fija la unidad del otro idioma', () => {
    for (const s of strings(es)) expect(s, s).not.toMatch(/\b(Nm|NM|nmi)\b/)
    for (const s of strings(en)) expect(s, s).not.toMatch(/\b(Mn|NM|nmi)\b/)
  })
})
