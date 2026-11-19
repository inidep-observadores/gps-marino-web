import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RoutePoint } from '@gpsm/shared'
import { useConfirm } from '@/composables/useConfirm'
import { useNavigationStore } from '@/stores/navigation'
import { useToastStore } from '@/stores/toast'

/**
 * Acciones de ruta compartidas por el mapa (cursor y ficha de elemento) y la pestaña GPS, como en la app Flutter:
 * - sin ruta, "Navegar aquí" la inicia con ese punto;
 * - con una ruta en curso, el mismo botón pasa a "Añadir a la ruta" y suma un tramo al final;
 * - "Cancelar destino" borra la ruta completa (con confirmación: en un barco en movimiento es fácil tocar de más).
 */
export function useRouteActions() {
  const { t } = useI18n()
  const nav = useNavigationStore()
  const toast = useToastStore()
  const confirm = useConfirm()

  const hasRoute = computed(() => nav.route.length > 0)
  /** Texto del botón según haya o no ruta en curso. */
  const addLabel = computed(() => (hasRoute.value ? t('destination.append') : t('destination.setTarget')))

  /** Inicia la ruta con el punto o, si ya hay una, lo agrega como nuevo tramo. */
  function goOrAppend(p: RoutePoint) {
    if (hasRoute.value) {
      nav.append(p)
      toast.push(t('destination.added', { name: p.name }), { tone: 'success' })
    } else {
      nav.setTarget(p)
      toast.push(t('destination.targetSet', { name: p.name }), { tone: 'success' })
    }
  }

  async function cancelRoute(): Promise<boolean> {
    const ok = await confirm({
      title: t('navigation.confirmClearTitle'),
      message: t('navigation.confirmClearMsg'),
      confirmLabel: t('navigation.cancelTarget'),
      tone: 'danger',
    })
    if (ok) nav.clear()
    return ok
  }

  return { hasRoute, addLabel, goOrAppend, cancelRoute }
}
