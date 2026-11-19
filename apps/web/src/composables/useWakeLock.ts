import { onScopeDispose, ref, watch, type Ref } from 'vue'

/**
 * Mantiene la pantalla encendida mientras `active` sea verdadero (Screen Wake Lock API).
 * El navegador suelta el bloqueo al ocultar la pestaña: se vuelve a pedir al volver a estar visible.
 * Sin pantalla encendida el navegador suspende el GPS, por eso se usa mientras el GPS está activo.
 */
export function useWakeLock(active: Ref<boolean>) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const held = ref(false)
  let sentinel: WakeLockSentinel | null = null

  async function acquire() {
    if (!supported || sentinel || document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      held.value = true
      sentinel.addEventListener('release', () => {
        sentinel = null
        held.value = false
      })
    } catch {
      held.value = false
    }
  }

  async function release() {
    const s = sentinel
    sentinel = null
    held.value = false
    await s?.release().catch(() => {})
  }

  const onVisibility = () => {
    if (active.value && document.visibilityState === 'visible') void acquire()
  }
  document.addEventListener('visibilitychange', onVisibility)
  watch(active, (on) => (on ? acquire() : release()), { immediate: true })
  onScopeDispose(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    void release()
  })

  return { supported, held }
}
