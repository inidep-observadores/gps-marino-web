import { onScopeDispose, ref, type Ref } from 'vue'

/** Resultado reactivo de una media query (se actualiza al rotar o redimensionar). */
export function useMediaQuery(query: string): Ref<boolean> {
  const media = window.matchMedia(query)
  const matches = ref(media.matches)
  const onChange = (e: MediaQueryListEvent) => {
    matches.value = e.matches
  }
  media.addEventListener('change', onChange)
  onScopeDispose(() => media.removeEventListener('change', onChange))
  return matches
}

/** Pantalla de escritorio (el breakpoint `lg` de Tailwind): ahí hay lugar para modales anchos. */
export const DESKTOP_QUERY = '(min-width: 1024px)'
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY)
