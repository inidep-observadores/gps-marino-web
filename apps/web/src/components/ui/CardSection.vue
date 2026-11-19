<script setup lang="ts">
import type { Component } from 'vue'

/** Tarjeta con encabezado (ícono + título + subtítulo opcional) y una ranura para acciones. */
defineProps<{ title: string; subtitle?: string; icon?: Component; flush?: boolean }>()
</script>

<template>
  <section class="card card-reveal">
    <header class="card-header">
      <div class="flex min-w-0 items-center gap-2.5">
        <component :is="icon" v-if="icon" class="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        <div class="min-w-0">
          <h2 class="card-title">{{ title }}</h2>
          <p v-if="subtitle" class="text-caption truncate">{{ subtitle }}</p>
        </div>
      </div>
      <slot name="actions" />
    </header>
    <div :class="flush ? 'pt-3 pb-1' : 'card-body'">
      <slot />
    </div>
  </section>
</template>
