import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast'

/** Copia un texto al portapapeles y avisa. Sin permiso o sin la API (HTTP) avisa que no se pudo, no falla en silencio. */
export function useCopy() {
  const { t } = useI18n()
  const toast = useToastStore()
  return async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.push(t('converter.copied'), { tone: 'success', timeoutMs: 1600 })
    } catch {
      toast.push(t('converter.copyFailed'), { tone: 'warning' })
    }
  }
}
