/**
 * Reglas de la sugerencia de instalar la app (PWA), sin Vue ni DOM para poder probarlas:
 * - "Ahora no" (o cerrar el aviso del navegador sin instalar) silencia la sugerencia 24 horas.
 * - "No volver a mostrar" la silencia para siempre; Ajustes sigue ofreciendo instalar.
 * - La sugerencia aparece unos segundos después de abrir la app, para no tapar la primera impresión.
 * Las dos marcas viven en localStorage del dispositivo (no viajan con la cuenta).
 */
export const INSTALL_SNOOZED_KEY = 'gpsm.install.snoozed'
export const INSTALL_MUTED_KEY = 'gpsm.install.muted'
export const INSTALL_SNOOZE_MS = 24 * 60 * 60 * 1000
export const INSTALL_SUGGEST_DELAY_MS = 6000

/** Subconjunto de `Storage` que usamos (se inyecta en los tests). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function isInstallMuted(store: KeyValueStore): boolean {
  try {
    return store.getItem(INSTALL_MUTED_KEY) === '1'
  } catch {
    return false
  }
}

export function setInstallMuted(store: KeyValueStore, muted: boolean): void {
  try {
    if (muted) store.setItem(INSTALL_MUTED_KEY, '1')
    else store.removeItem(INSTALL_MUTED_KEY)
  } catch {
    // Sin almacenamiento (modo privado): vale solo para esta sesión.
  }
}

export function isInstallSnoozed(store: KeyValueStore, now: number): boolean {
  try {
    const until = Number(store.getItem(INSTALL_SNOOZED_KEY))
    return Number.isFinite(until) && until > now
  } catch {
    // Sin almacenamiento se sugiere igual: no es grave.
    return false
  }
}

export function snoozeInstall(store: KeyValueStore, now: number): void {
  try {
    store.setItem(INSTALL_SNOOZED_KEY, String(now + INSTALL_SNOOZE_MS))
  } catch {
    // Sin almacenamiento, el aviso reaparece en la próxima visita.
  }
}

/** ¿Hay que callar la sugerencia automática? (Ajustes la ignora.) */
export function isInstallSuppressed(store: KeyValueStore, now: number): boolean {
  return isInstallMuted(store) || isInstallSnoozed(store, now)
}

/** iPhone/iPad: no existe `beforeinstallprompt`, solo se pueden mostrar los pasos del menú "Compartir". */
export function detectIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true
  // iPadOS 13+ se presenta como Mac; se distingue por la pantalla táctil.
  return userAgent.includes('Macintosh') && maxTouchPoints > 1
}
