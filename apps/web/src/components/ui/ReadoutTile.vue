<script setup lang="ts">
import type { Component } from 'vue'
import type { Status } from '@/types'

/** Lectura de instrumento: etiqueta, valor grande con unidad, una línea de contexto y detalle opcional. */
defineProps<{
  label: string
  value: string
  unit?: string
  meta?: string
  icon?: Component
  status?: Status
  /** Etiqueta y valor centrados (instrumentos con un solo dato). */
  center?: boolean
}>()
</script>

<template>
  <div class="readout" :class="{ 'items-center text-center': center }" :data-status="status">
    <span class="readout-label" :class="{ 'justify-center': center }">
      <component :is="icon" v-if="icon" class="size-3.5" aria-hidden="true" />
      {{ label }}
      <span v-if="status && status !== 'green'" class="status-dot ml-auto" aria-hidden="true"></span>
    </span>
    <span class="readout-value" :class="{ 'status-text': status && status !== 'green' }">
      {{ value }}<span v-if="unit" class="readout-unit">{{ unit }}</span>
    </span>
    <span v-if="meta || $slots.meta" class="readout-meta" :class="{ 'max-w-full': center }">
      <slot name="meta">{{ meta }}</slot>
    </span>
    <!-- Detalle adicional opcional (p. ej. desglose por constelación). -->
    <slot />
  </div>
</template>
