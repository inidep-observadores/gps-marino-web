import { defineAsyncComponent, h } from 'vue'

/**
 * El mapa (MapLibre, ~280 KB gzip) va en su propio fragmento para que la pestaña GPS abra rápido, pero se
 * PRECACHEA con la app (a diferencia de Drone Forecast): en altamar tiene que abrir sin red desde el primer uso.
 * No importar `MapCanvas.vue` ni `maplibre-gl` directamente en otro lado.
 */
const MapPlaceholder = { render: () => h('div', { class: 'skeleton size-full rounded-none' }) }

export const LazyMapCanvas = defineAsyncComponent({
  loader: () => import('@/components/map/MapCanvas.vue'),
  loadingComponent: MapPlaceholder,
  delay: 0,
})
