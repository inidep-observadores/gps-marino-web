<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watchEffect } from 'vue'
import NavigationCard from '@/components/gps/NavigationCard.vue'
import PositionCard from '@/components/gps/PositionCard.vue'
import { GPS_STATUS_COLOR } from '@/logic/gpsStatus'
import { useGpsStore } from '@/stores/gps'

/**
 * Pestaña GPS: lecturas de posición (columna lateral) y navegación hacia el destino o la ruta (columna principal).
 * La tarjeta de navegación solo se muestra con el GPS activo y con posición: sin eso no hay distancias ni rumbos que
 * mostrar y elegir un destino no tiene sentido (como en la app Flutter). Si la señal se pierde un momento (`stale`)
 * sigue visible para no esconder la ruta en plena navegación.
 */
const gps = useGpsStore()
const showNavigation = computed(() => gps.status === 'fixed' || gps.status === 'stale')

/**
 * El fondo de la página se tiñe con el color del estado del GPS (resplandor y retícula de `body[data-status]`, como el
 * veredicto de Drone Forecast): verde con señal, ámbar buscando o señal vieja, rojo con error. Solo en esta pestaña.
 */
const active = ref(true)
const clearGlow = () => delete document.body.dataset.status
watchEffect(() => {
  const status = GPS_STATUS_COLOR[gps.status]
  if (active.value && status !== 'none') document.body.dataset.status = status
  else clearGlow()
})
onActivated(() => (active.value = true))
onDeactivated(() => (active.value = false))
onBeforeUnmount(clearGlow)
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-aside">
      <PositionCard />
    </div>
    <div v-if="showNavigation" class="dashboard-main">
      <NavigationCard />
    </div>
  </div>
</template>
