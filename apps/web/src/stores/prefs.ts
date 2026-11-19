import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { readJson, writeJson } from '@/composables/storage'

/**
 * Preferencias propias de ESTE dispositivo (no se sincronizan): idioma y tema.
 * Viven en localStorage porque `index.html` lee el tema antes del primer render (si cambia la clave, actualizar ambos).
 * Los ajustes que viajan con la cuenta (mapa, rutas, capas) van en la tabla `settings` de SQLite.
 */
export const PREFS_KEY = 'gpsm.prefs.v1'

export type Locale = 'es' | 'en'
export type ThemePreference = 'system' | 'light' | 'dark' | 'night'

interface Persisted {
  locale: Locale
  theme: ThemePreference
}

export const usePrefsStore = defineStore('prefs', () => {
  const saved = readJson<Persisted>(PREFS_KEY)
  const locale = ref<Locale>(saved.locale ?? 'es')
  const theme = ref<ThemePreference>(saved.theme ?? 'system')

  watch([locale, theme], () => writeJson(PREFS_KEY, { locale: locale.value, theme: theme.value }))

  return { locale, theme }
})
