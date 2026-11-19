import { shallowRef } from 'vue'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` pinta el botón de confirmar como acción destructiva. */
  tone?: 'danger' | 'default'
}

interface Pending {
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

/** Pedido de confirmación en curso (uno a la vez); lo muestra `ConfirmHost`. */
export const pendingConfirm = shallowRef<Pending | null>(null)

/** Responde al pedido actual y lo cierra. */
export function answerConfirm(ok: boolean): void {
  const p = pendingConfirm.value
  pendingConfirm.value = null
  p?.resolve(ok)
}

/**
 * Pide confirmación con un diálogo propio (no `window.confirm`). Se usa como `if (await confirm({...})) hacerAlgo()`.
 * Si ya había uno abierto, ese se cancela. Requiere que `ConfirmHost` esté montado (está en `AppSheets`).
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return (options) =>
    new Promise<boolean>((resolve) => {
      pendingConfirm.value?.resolve(false)
      pendingConfirm.value = { options, resolve }
    })
}
