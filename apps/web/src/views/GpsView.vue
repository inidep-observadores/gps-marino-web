<script setup lang="ts">
import NavigationCard from '@/components/gps/NavigationCard.vue'
import PositionCard from '@/components/gps/PositionCard.vue'

/** Pestaña GPS: lecturas de posición (columna lateral) y navegación hacia el destino o la ruta (columna principal). */
</script>

<template>
  <div class="dashboard">
    <div class="dashboard-aside">
      <PositionCard />
    </div>
    <div class="dashboard-main">
      <NavigationCard />
    </div>
  </div>
</template>
