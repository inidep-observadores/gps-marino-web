import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastTone = 'info' | 'success' | 'warning'

export interface Toast {
  id: number
  message: string
  title?: string
  tone: ToastTone
}

/** Avisos breves en pantalla (también respaldo de las notificaciones del sistema). */
export const useToastStore = defineStore('toast', () => {
  const items = ref<Toast[]>([])
  let seq = 0

  function dismiss(id: number) {
    items.value = items.value.filter((t) => t.id !== id)
  }

  function push(message: string, opts: { title?: string; tone?: ToastTone; timeoutMs?: number } = {}) {
    const id = ++seq
    items.value = [...items.value.slice(-2), { id, message, title: opts.title, tone: opts.tone ?? 'info' }]
    const timeout = opts.timeoutMs ?? 4000
    if (timeout > 0) setTimeout(() => dismiss(id), timeout)
    return id
  }

  return { items, push, dismiss }
})
