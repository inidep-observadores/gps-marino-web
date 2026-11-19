import { computed, effectScope, ref, watchEffect, type ComputedRef } from 'vue'
import { usePrefsStore, type ThemePreference } from '@/stores/prefs'

export type ResolvedTheme = 'light' | 'dark' | 'night'

/** Colores de la barra del sistema (deben coincidir con `--ds-canvas` de style.css). */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f4f5f7', dark: '#0b0e13', night: '#0d0606' }

interface ThemeState {
  resolved: ComputedRef<ResolvedTheme>
  /** El tema efectivo tiene fondo oscuro (oscuro o nocturno): sirve, p. ej., para elegir el estilo del mapa. */
  isDark: ComputedRef<boolean>
  setTheme: (t: ThemePreference) => void
}

let state: ThemeState | null = null

/**
 * Tema efectivo según la preferencia del usuario y la del sistema. Estado único compartido: la primera
 * llamada aplica `data-theme` y `<meta name="theme-color">`; las siguientes reutilizan el mismo estado.
 * `index.html` aplica el tema antes del primer render para evitar el destello.
 */
export function useTheme(): ThemeState {
  if (state) return state
  state = effectScope(true).run(() => {
    const prefs = usePrefsStore()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const systemDark = ref(media.matches)
    media.addEventListener('change', (e) => {
      systemDark.value = e.matches
    })

    const resolved = computed<ResolvedTheme>(() =>
      prefs.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : prefs.theme,
    )

    watchEffect(() => {
      document.documentElement.dataset.theme = resolved.value
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved.value])
    })

    return {
      resolved,
      isDark: computed(() => resolved.value !== 'light'),
      setTheme: (t: ThemePreference) => {
        prefs.theme = t
      },
    }
  })!
  return state
}
