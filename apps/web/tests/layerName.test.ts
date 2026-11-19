import { describe, expect, it } from 'vitest'
import { LAYER_NAME_MAX, validateLayerName } from '../src/logic/layerName'

describe('nombre de una capa importada', () => {
  it('acepta un nombre nuevo y lo deja sin espacios de más', () => {
    expect(validateLayerName('  Lances   de   noviembre ', ['veda'])).toEqual({ ok: true, name: 'Lances de noviembre' })
  })

  it('rechaza el vacío', () => {
    expect(validateLayerName('', [])).toEqual({ ok: false, error: 'empty' })
    expect(validateLayerName('   ', [])).toEqual({ ok: false, error: 'empty' })
  })

  it('rechaza el nombre de otra capa, sin distinguir mayúsculas', () => {
    expect(validateLayerName('Veda', ['veda', 'otra'])).toEqual({ ok: false, error: 'exists' })
    expect(validateLayerName('OTRA', ['veda', 'otra'])).toEqual({ ok: false, error: 'exists' })
  })

  it('el nombre de la propia capa no cuenta como repetido (solo se compara con las demás)', () => {
    // La capa se llama "lances_export": quien llama pasa solo los nombres de las otras.
    expect(validateLayerName('Lances_Export', ['veda'])).toEqual({ ok: true, name: 'Lances_Export' })
  })

  it('recorta un nombre demasiado largo', () => {
    const r = validateLayerName('x'.repeat(LAYER_NAME_MAX + 50), [])
    expect(r.ok && r.name.length).toBe(LAYER_NAME_MAX)
  })
})
