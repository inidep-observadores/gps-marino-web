import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeftRight, Map as MapIcon, MapPinned, Route as RouteIcon, Satellite, Wind } from '@lucide/vue'
import type { ViewId } from '@/stores/ui'

export interface NavItem {
  id: ViewId
  label: string
  icon: Component
}

/** Secciones principales (las tres pestañas de la app Flutter más el conversor), compartidas por la barra inferior y las pestañas. */
export function useNavItems() {
  const { t } = useI18n()
  return computed<NavItem[]>(() => [
    { id: 'gps', label: t('nav.gps'), icon: Satellite },
    { id: 'waypoints', label: t('nav.waypoints'), icon: MapPinned },
    { id: 'map', label: t('nav.map'), icon: MapIcon },
    { id: 'tracks', label: t('nav.tracks'), icon: RouteIcon },
    { id: 'converter', label: t('nav.converter'), icon: ArrowLeftRight },
    { id: 'beaufort', label: t('nav.beaufort'), icon: Wind },
  ])
}
