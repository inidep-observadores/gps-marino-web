import { describe, expect, it } from 'vitest'
import {
  detectIos,
  INSTALL_MUTED_KEY,
  INSTALL_SNOOZE_MS,
  INSTALL_SNOOZED_KEY,
  isInstallMuted,
  isInstallSnoozed,
  isInstallSuppressed,
  setInstallMuted,
  snoozeInstall,
  type KeyValueStore,
} from '../src/logic/installPrompt'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}
const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error('sin almacenamiento')
  },
  setItem: () => {
    throw new Error('sin almacenamiento')
  },
  removeItem: () => {
    throw new Error('sin almacenamiento')
  },
}

describe('sugerencia de instalación', () => {
  it('sin marcas se sugiere', () => {
    expect(isInstallSuppressed(memoryStore(), 1000)).toBe(false)
  })

  it('"Ahora no" silencia 24 horas y luego vuelve a sugerir', () => {
    const s = memoryStore()
    snoozeInstall(s, 1000)
    expect(s.data.get(INSTALL_SNOOZED_KEY)).toBe(String(1000 + INSTALL_SNOOZE_MS))
    expect(isInstallSnoozed(s, 1000 + INSTALL_SNOOZE_MS - 1)).toBe(true)
    expect(isInstallSnoozed(s, 1000 + INSTALL_SNOOZE_MS)).toBe(false)
  })

  it('"No volver a mostrar" silencia para siempre y se puede deshacer', () => {
    const s = memoryStore()
    setInstallMuted(s, true)
    expect(s.data.get(INSTALL_MUTED_KEY)).toBe('1')
    expect(isInstallSuppressed(s, Number.MAX_SAFE_INTEGER / 2)).toBe(true)
    setInstallMuted(s, false)
    expect(isInstallMuted(s)).toBe(false)
  })

  it('un valor guardado inválido no silencia', () => {
    const s = memoryStore()
    s.setItem(INSTALL_SNOOZED_KEY, 'basura')
    expect(isInstallSnoozed(s, 5)).toBe(false)
  })

  it('sin almacenamiento disponible no falla y se sugiere igual', () => {
    expect(() => snoozeInstall(brokenStore, 1)).not.toThrow()
    expect(() => setInstallMuted(brokenStore, true)).not.toThrow()
    expect(isInstallSuppressed(brokenStore, 1)).toBe(false)
  })

  it('detecta iPhone, iPad e iPadOS que se presenta como Mac', () => {
    expect(detectIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true)
    expect(detectIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(detectIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(detectIos('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120', 5)).toBe(false)
  })
})
