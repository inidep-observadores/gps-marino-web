<script setup lang="ts">
import type { Component } from 'vue'
import type { Status } from '@/types'

/**
 * Tarjeta con encabezado (ícono + título + subtítulo opcional) y una ranura para acciones.
 * Con `status` lleva un halo del color del estado arriba (como el veredicto de Drone Forecast) y es contenedor (`@container`).
 */
defineProps<{ title: string; subtitle?: string; icon?: Component; flush?: boolean; status?: Status }>()
</script>

<template>
  <section class="card card-reveal @container" :class="{ 'overflow-hidden': status && status !== 'none' }" :data-status="status">
    <div
      v-if="status && status !== 'none'"
      class="pointer-events-none absolute inset-x-0 top-0 h-44 bg-linear-to-b from-status/14 to-transparent"
      aria-hidden="true"
    ></div>
    <header class="card-header relative">
      <div class="flex min-w-0 items-center gap-2.5">
        <component :is="icon" v-if="icon" class="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        <div class="min-w-0">
          <h2 class="card-title">{{ title }}</h2>
          <p v-if="subtitle" class="text-caption truncate">{{ subtitle }}</p>
        </div>
      </div>
      <slot name="actions" />
    </header>
    <div class="relative" :class="flush ? 'pt-3 pb-1' : 'card-body'">
      <slot />
    </div>
  </section>
</template>
