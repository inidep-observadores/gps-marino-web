<script setup lang="ts">
import { computed } from 'vue'
import NavigationCard from '@/components/gps/NavigationCard.vue'
import PositionCard from '@/components/gps/PositionCard.vue'
import { useGpsStore } from '@/stores/gps'

/**
 * Pestaña GPS: lecturas de posición (columna lateral) y navegación hacia el destino o la ruta (columna principal).
 * La tarjeta de navegación solo se muestra con el GPS activo y con posición: sin eso no hay distancias ni rumbos que
 * mostrar y elegir un destino no tiene sentido (como en la app Flutter). Si la señal se pierde un momento (`stale`)
 * sigue visible para no esconder la ruta en plena navegación.
 */
const gps = useGpsStore()
const showNavigation = computed(() => gps.status === 'fixed' || gps.status === 'stale')
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
