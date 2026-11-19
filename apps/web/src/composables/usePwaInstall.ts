import { computed, ref } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Estado de módulo: el evento llega una sola vez y lo puede necesitar cualquier componente.
const deferred = ref<BeforeInstallPromptEvent | null>(null)
const installed = ref(typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches)

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred.value = e as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferred.value = null
  })
}

/** Instalación como PWA (Chrome/Edge/Android). En iOS se instala desde "Compartir → Agregar a inicio". */
export function usePwaInstall() {
  const canInstall = computed(() => !!deferred.value && !installed.value)

  async function install(): Promise<boolean> {
    const e = deferred.value
    if (!e) return false
    await e.prompt()
    const { outcome } = await e.userChoice
    deferred.value = null
    return outcome === 'accepted'
  }

  return { canInstall, installed, install }
}
