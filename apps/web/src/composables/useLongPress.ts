/**
 * Pulsación larga (como el `onLongPress` de Flutter) para entrar en selección múltiple desde una fila.
 * Devuelve manejadores de puntero para la fila y `consumeClick()`, que indica si el click siguiente hay que
 * ignorarlo (porque ya se resolvió como pulsación larga). Se cancela si el dedo se mueve (scroll).
 */
export function useLongPress(onLongPress: () => void, ms = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let fired = false
  let x = 0
  let y = 0

  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    handlers: {
      onPointerdown(e: PointerEvent) {
        if (e.button !== 0) return
        fired = false
        x = e.clientX
        y = e.clientY
        cancel()
        timer = setTimeout(() => {
          fired = true
          try {
            navigator.vibrate?.(30)
          } catch {
            /* sin vibración */
          }
          onLongPress()
        }, ms)
      },
      onPointermove(e: PointerEvent) {
        if (Math.abs(e.clientX - x) > 10 || Math.abs(e.clientY - y) > 10) cancel()
      },
      onPointerup: cancel,
      onPointercancel: cancel,
      onPointerleave: cancel,
      // Evita el menú contextual del navegador en la pulsación larga (Android).
      onContextmenu(e: Event) {
        if (fired || timer) e.preventDefault()
      },
    },
    consumeClick(): boolean {
      const was = fired
      fired = false
      return was
    },
  }
}
