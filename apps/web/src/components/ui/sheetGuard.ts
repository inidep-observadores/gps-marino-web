import { inject, onBeforeUnmount, type InjectionKey } from 'vue'

/** Devuelve `true` si la hoja se puede cerrar. */
export type CloseGuard = () => boolean | Promise<boolean>

export const CLOSE_GUARD_KEY: InjectionKey<(g: CloseGuard | null) => void> = Symbol('sheet-close-guard')

/** Registra un guardia de cierre en la `BaseSheet` que contiene al componente (sin efecto fuera de una hoja). */
export function useCloseGuard(guard: CloseGuard): void {
  const register = inject(CLOSE_GUARD_KEY, null)
  register?.(guard)
  onBeforeUnmount(() => register?.(null))
}
