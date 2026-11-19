import { computed, ref, shallowRef } from 'vue'
import {
  detectIos,
  INSTALL_SUGGEST_DELAY_MS,
  isInstallSuppressed,
  setInstallMuted,
  snoozeInstall,
} from '@/logic/installPrompt'

/**
 * Sugerencia de instalar la app (PWA). El estado vive en el módulo porque el navegador dispara `beforeinstallprompt`
 * una sola vez y muy temprano, antes de montar ninguna vista: `startPwaInstall()` registra los listeners desde main.ts.
 *
 * - Chrome/Edge/Android: se captura el evento y se ofrece el aviso nativo.
 * - iOS/iPadOS: no hay API para instalar; se muestran las instrucciones del menú "Compartir".
 * - Si la app ya corre instalada (display-mode standalone) no se sugiere nada.
 * Reglas de cuándo reaparece: `logic/installPrompt.ts` (24 h tras "Ahora no", o nunca con "No volver a mostrar").
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALLED_MODES = ['standalone', 'minimal-ui', 'fullscreen']

const deferred = shallowRef<BeforeInstallPromptEvent | null>(null)
const installed = ref(false)
const isOpen = ref(false)
const isIos = ref(false)
const muted = ref(false)

let started = false
let scheduled = false

function detectInstalled(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  return INSTALLED_MODES.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)
}

const available = computed(() => !installed.value && (deferred.value !== null || isIos.value))
const suppressed = () => muted.value || isInstallSuppressed(localStorage, Date.now())

function scheduleSuggestion() {
  if (scheduled || suppressed()) return
  scheduled = true
  window.setTimeout(() => {
    if (available.value && !suppressed()) isOpen.value = true
  }, INSTALL_SUGGEST_DELAY_MS)
}

/** Registra los listeners. Se llama una sola vez desde main.ts, antes de montar. */
export function startPwaInstall() {
  if (started) return
  started = true

  installed.value = detectInstalled()
  isIos.value = detectIos(navigator.userAgent, navigator.maxTouchPoints)
  try {
    muted.value = localStorage.getItem('gpsm.install.muted') === '1'
  } catch {
    muted.value = false
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Se suprime el mini-aviso del navegador: lo reemplaza el diálogo propio.
    e.preventDefault()
    deferred.value = e as BeforeInstallPromptEvent
    scheduleSuggestion()
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferred.value = null
    isOpen.value = false
  })
  // Si se instala desde el menú del navegador, display-mode cambia en vivo.
  for (const m of INSTALLED_MODES) {
    window.matchMedia(`(display-mode: ${m})`).addEventListener('change', () => {
      installed.value = detectInstalled()
      if (installed.value) isOpen.value = false
    })
  }
  if (isIos.value && !installed.value) scheduleSuggestion()
}

export function usePwaInstall() {
  /** Lanza el aviso nativo del navegador (solo si se capturó el evento). */
  async function install() {
    const e = deferred.value
    if (!e) return
    isOpen.value = false
    // El evento es de un solo uso.
    deferred.value = null
    await e.prompt()
    const { outcome } = await e.userChoice
    if (outcome === 'dismissed') snoozeInstall(localStorage, Date.now())
  }

  /** "Ahora no": cierra y no vuelve a sugerir por 24 horas. */
  function dismiss() {
    isOpen.value = false
    snoozeInstall(localStorage, Date.now())
  }

  /** "No volver a mostrar": se guarda al instante, así vale sea cual sea la forma de cerrar. */
  function setMuted(value: boolean) {
    muted.value = value
    setInstallMuted(localStorage, value)
  }

  /** Apertura manual (Ajustes): ignora el "Ahora no" y el "No volver a mostrar". */
  function show() {
    if (available.value) isOpen.value = true
  }

  /** Un toque desde Ajustes: aviso nativo si existe, instrucciones si no (iOS). */
  function requestInstall() {
    if (deferred.value) void install()
    else show()
  }

  return { available, isOpen, isIos, muted, setMuted, install, dismiss, show, requestInstall }
}
